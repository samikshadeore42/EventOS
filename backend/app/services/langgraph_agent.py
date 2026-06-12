
# File: backend/app/services/langgraph_agent.py
#
# LangGraph conversational agent for dynamic event configuration.
#
# WHAT THIS DOES:
#   A committee member describes their event in plain English.
#   The agent holds a multi-turn conversation, asks clarifying
#   questions for any missing fields, and when it has everything
#   it needs, outputs a structured config JSON.
#
# DESIGN:
#   - LangGraph graph with one node: call_llm
#   - Conversation history is stored in Redis per session_id
#     (not in LangGraph's own persistence — we manage state ourselves)
#   - Each call to run_agent_turn() runs ONE turn of the conversation:
#       load history from Redis
#       → run graph
#       → save updated history to Redis
#       → return {reply, is_complete, config}
#
# WHY SYNCHRONOUS (no Celery):
#   This is a chat interface — one fast LLM call per message.
#   The user expects a response like a chat, not a polling loop.
#   Each turn is one Gemini call (~3-8s), acceptable for a chat UI.

import os
import json
from typing import TypedDict, Optional, List, Any

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.redis_client import get_redis

# ── Redis session config ──────────────────────────────────────────────
SESSION_KEY_PREFIX = "langgraph:session:"
SESSION_TTL = 60 * 60 * 2   # 2 hours — same as TaskTracker

# ── System prompt ────────────────────────────────────────────────────
# Tells the LLM its role, what fields to collect, and exactly how
# to signal completion (COMPLETE: prefix + raw JSON).

AGENT_SYSTEM_PROMPT = """\
You are an event configuration assistant for EventOS, an AI-powered hackathon management platform.

Your job is to collect information about an event from a committee member through natural conversation,
then produce a structured configuration JSON that the system will use to run the event.

The 7 fields you must collect:
  1. event_name       — name of the event (string)
  2. rounds           — number of rounds (integer, e.g. 2 or 3)
  3. stages           — ordered list of stage names (e.g. ["registration", "team_formation", "evaluation", "results"])
  4. team_size        — number of members per team (integer)
  5. scoring_weights  — list of floats summing to 1.0, one per evaluation criterion (e.g. [0.30, 0.30, 0.40])
  6. elimination      — whether losing teams are eliminated each round (true/false)
  7. approval_gates   — which stages require a human committee approval before proceeding
                        (e.g. ["after_team_formation", "after_each_round"])

RULES:
- Ask ONE clarifying question at a time. Be conversational, not robotic.
- Extract as much as possible from what the user says before asking.
- Use sensible defaults if the user seems unsure:
    team_size=3, rounds=2, elimination=false,
    stages=["registration","team_formation","evaluation","results"],
    approval_gates=["after_team_formation","after_results"]
- When you have ALL 7 fields (inferred or stated), respond with EXACTLY this format
  and NOTHING else — no intro text, no explanation:

COMPLETE:
{
  "event_name": "...",
  "rounds": 2,
  "stages": ["registration", "team_formation", "evaluation", "results"],
  "team_size": 3,
  "scoring_weights": [0.30, 0.30, 0.40],
  "elimination": false,
  "approval_gates": ["after_team_formation", "after_results"]
}

- Do NOT output the COMPLETE: block until you genuinely have all 7 fields.
- If the user's first message already contains everything, output COMPLETE: immediately.\
"""


# ── LangGraph state ──────────────────────────────────────────────────
# TypedDict that flows through the graph nodes.

class AgentState(TypedDict):
    # Full conversation as LangChain message objects (SystemMessage excluded —
    # that's added at call time). Alternates HumanMessage / AIMessage.
    history:     List[Any]
    # Raw text response from the LLM for this turn
    raw_reply:   str
    # Parsed outputs
    reply:       str
    is_complete: bool
    config:      Optional[dict]


# ── LLM singleton ────────────────────────────────────────────────────
_llm_instance: Optional[ChatGoogleGenerativeAI] = None

def _get_llm() -> ChatGoogleGenerativeAI:
    """Lazy singleton — same pattern as ai_service.py."""
    global _llm_instance
    if _llm_instance is not None:
        return _llm_instance

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY not set. Add to backend/.env and restart."
        )

    _llm_instance = ChatGoogleGenerativeAI(
        model          = os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        temperature    = 0.4,    # lower than ai_service — we want consistent extraction
        google_api_key = api_key,
        max_retries    = 1,
        timeout        = 60,
    )
    return _llm_instance


# ── Graph node ───────────────────────────────────────────────────────

def call_llm_node(state: AgentState) -> AgentState:
    """
    Single node in the LangGraph graph.
    Calls Gemini with the full conversation history,
    parses the response, detects if the config is complete.
    """
    llm = _get_llm()

    # Build the message list: system prompt + full history
    messages = [SystemMessage(content=AGENT_SYSTEM_PROMPT)] + state["history"]

    response = llm.invoke(messages)
    raw = (response.content or "").strip()

    # ── Parse response ────────────────────────────────────────────────
    # If the LLM has all info, it starts with "COMPLETE:" followed by JSON.
    if raw.startswith("COMPLETE:"):
        json_part = raw[len("COMPLETE:"):].strip()

        # Strip markdown fences if LLM added them anyway
        if json_part.startswith("```"):
            json_part = json_part.split("```", 2)[1]
            if json_part.startswith("json"):
                json_part = json_part[4:]
            json_part = json_part.strip().rstrip("`").strip()

        try:
            config = json.loads(json_part)
            # Build a friendly confirmation message
            reply = (
                f"Perfect — I have everything I need. Here's the configuration "
                f"for \"{config.get('event_name', 'your event')}\". "
                f"Please review and click 'Confirm & Create Event' when ready."
            )
            return {
                **state,
                "raw_reply":   raw,
                "reply":       reply,
                "is_complete": True,
                "config":      config,
            }
        except json.JSONDecodeError:
            # LLM said COMPLETE but JSON was malformed — treat as a clarifying turn
            reply = "I have most of the details. Could you confirm the team size and number of rounds so I can finalize the config?"
            return {
                **state,
                "raw_reply":   raw,
                "reply":       reply,
                "is_complete": False,
                "config":      None,
            }

    # Normal conversational turn — just a question or acknowledgement
    return {
        **state,
        "raw_reply":   raw,
        "reply":       raw,
        "is_complete": False,
        "config":      None,
    }


# ── Build the graph ──────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("call_llm", call_llm_node)
    graph.set_entry_point("call_llm")
    graph.add_edge("call_llm", END)
    return graph.compile()

# Compile once at import time
_graph = _build_graph()


# ── Redis history helpers ────────────────────────────────────────────

def _session_key(session_id: str) -> str:
    return f"{SESSION_KEY_PREFIX}{session_id}:history"


def _load_history(session_id: str) -> List[Any]:
    """
    Load conversation history from Redis.
    Stored as a JSON list of {role, content} dicts.
    Converts back to LangChain message objects.
    """
    r = get_redis()
    raw = r.get(_session_key(session_id))
    if not raw:
        return []

    dicts = json.loads(raw)
    messages = []
    for d in dicts:
        if d["role"] == "human":
            messages.append(HumanMessage(content=d["content"]))
        elif d["role"] == "ai":
            messages.append(AIMessage(content=d["content"]))
    return messages


def _save_history(session_id: str, history: List[Any]) -> None:
    """
    Save updated conversation history to Redis.
    Serializes LangChain message objects to {role, content} dicts.
    """
    r = get_redis()
    dicts = []
    for msg in history:
        if isinstance(msg, HumanMessage):
            dicts.append({"role": "human", "content": msg.content})
        elif isinstance(msg, AIMessage):
            dicts.append({"role": "ai", "content": msg.content})
    r.set(_session_key(session_id), json.dumps(dicts), ex=SESSION_TTL)


def clear_session(session_id: str) -> None:
    """Delete session history from Redis (called after event is created)."""
    r = get_redis()
    r.delete(_session_key(session_id))


# ── Public API ───────────────────────────────────────────────────────

def run_agent_turn(message: str, session_id: str) -> dict:
    """
    Run one turn of the configuration conversation.

    Args:
        message:    The committee member's latest message.
        session_id: Stable ID for this conversation (frontend generates once on load).

    Returns:
        {
            "reply":       str,          # Agent's response to show in chat
            "is_complete": bool,         # True when config is ready
            "config":      dict | None,  # Structured config, set when is_complete=True
        }
    """
    # 1. Load existing history from Redis
    history = _load_history(session_id)

    # 2. Append the new user message
    history.append(HumanMessage(content=message))

    # 3. Run the LangGraph graph for one turn
    initial_state: AgentState = {
        "history":     history,
        "raw_reply":   "",
        "reply":       "",
        "is_complete": False,
        "config":      None,
    }
    result = _graph.invoke(initial_state)

    # 4. Append the AI response to history and save back to Redis
    history.append(AIMessage(content=result["raw_reply"]))
    _save_history(session_id, history)

    # 5. Return the structured output
    return {
        "reply":       result["reply"],
        "is_complete": result["is_complete"],
        "config":      result["config"],
    }
