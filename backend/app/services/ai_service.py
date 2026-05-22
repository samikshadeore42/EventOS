# File: backend/app/services/ai_service.py
#
# LLM-powered text generation for EventOS using Google Gemini via LangChain.
#
# The LLM never makes decisions. It only turns structured input into prose:
#
#   1. generate_team_rationale     — explains why the CSP solver formed a team
#   2. draft_communication         — writes stage-appropriate emails
#   3. generate_evaluation_rubric  — produces a judge-facing scoring guide
#   4. explain_anomaly             — turns a statistical finding into a narrative
#
# Each method follows the same shape: structured input → LLM call → text/JSON output.
# Deterministic systems (CSP solver, anomaly detector, scheduler) decide WHAT
# happens; this service only decides HOW it's worded.

import os
import json
from typing import Optional, Dict, List

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import HumanMessage, SystemMessage


# ── LLM client (lazy singleton) ──────────────────────────────────────
# Created on first use, then reused. Lazy creation means importing this
# module doesn't fail if GOOGLE_API_KEY isn't set yet — only calling
# an AI method does, which makes local development without a key easier.

_llm_instance: Optional[ChatGoogleGenerativeAI] = None


def _get_llm() -> ChatGoogleGenerativeAI:
    """Return the shared LLM client, creating it if needed."""
    global _llm_instance
    if _llm_instance is not None:
        return _llm_instance

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY is not set. Add it to backend/.env and restart "
            "the Celery worker. Get a free key at https://aistudio.google.com/apikey"
        )

    _llm_instance = ChatGoogleGenerativeAI(
        model       = os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        temperature = 0.7,
        google_api_key  = api_key,
        max_retries     = 2,
        timeout         = 60,
    )
    return _llm_instance


def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """One LLM round-trip. Returns the assistant's text content."""
    llm = _get_llm()
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])
    return (response.content or "").strip()


def _extract_json(text: str) -> dict:
    """
    LLMs sometimes wrap JSON in ```json ... ``` fences or add a stray
    sentence before/after. Strip fences and pull out the first valid
    JSON object.
    """
    text = text.strip()

    # Strip code fences if present
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()

    # Find the first { and last } — handles trailing prose
    start = text.find("{")
    end   = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in LLM response: {text[:200]}")

    return json.loads(text[start : end + 1])


# ── Prompts ──────────────────────────────────────────────────────────
# Kept at the top of the file so they're easy to tune without hunting
# through method bodies. Each system prompt sets the LLM's role; each
# method below builds the user prompt from structured input.

TEAM_RATIONALE_SYSTEM = """\
You are an assistant helping a hackathon committee review team formations.

Given a team's composition and the distribution rules used to form it, write a
concise 2-3 sentence rationale explaining why this team is balanced and suitable
for the event.

Focus on:
  - How the members' skills complement each other
  - How the team satisfies diversity or institutional constraints
  - Why this composition is likely to function well

Avoid generic phrases like "diverse and talented team." Be specific to the actual
members provided. Refer to people by first name. Output plain text only — no
markdown, no bullet points, no headings.\
"""

COMMUNICATION_SYSTEM = """\
You are drafting a professional email for a competitive event.

Write in a warm but professional tone, matched to the stage. Keep it under
180 words. Use the recipient's first name. Be specific to the context provided
— do NOT invent details that aren't in the context.

Return ONLY valid JSON in this exact shape:
{
  "subject": "Email subject line, under 80 characters",
  "body":    "Email body as plain text. Use \\n\\n for paragraph breaks."
}\
"""

RUBRIC_SYSTEM = """\
You are an expert at writing evaluation rubrics for competitive events.

Given a challenge area and the grading criteria with their weights, produce a
structured rubric that helps judges score consistently and fairly.

For each criterion, provide:
  - description: one sentence explaining what this criterion measures
  - what_to_look_for: 3-4 specific things judges should observe
  - scoring_guide: what scores at different bands mean

Return ONLY valid JSON in this exact shape:
{
  "criteria": [
    {
      "name":        "criterion name as given",
      "weight":      0.25,
      "description": "...",
      "what_to_look_for": ["...", "...", "..."],
      "scoring_guide": {
        "9-10": "Exemplary work that ...",
        "7-8":  "Strong work that ...",
        "4-6":  "Adequate work that ...",
        "0-3":  "Weak work that ..."
      }
    }
  ]
}\
"""

ANOMALY_EXPLANATION_SYSTEM = """\
You are explaining a statistical anomaly to a hackathon committee whose members
may not be statisticians. Translate the technical finding into a 2-3 sentence
plain-English narrative the committee can act on.

Mention what was found, what makes it suspicious, and how serious it is. Do not
be alarmist — these flags often have innocent explanations. Reference judges and
teams by name when provided. Output plain text only — no markdown.\
"""


# ── Service class ────────────────────────────────────────────────────

class AIService:
    """Stateless service. All methods are pure functions of their inputs."""

    # ── 1. Team rationale ────────────────────────────────────────────

    @staticmethod
    def generate_team_rationale(
        team_name:          str,
        members:            List[dict],          # [{name, institution, skills}, ...]
        distribution_rules: dict,                # {team_size, constraints, ...}
        challenge_area:     Optional[str] = None,
    ) -> str:
        """
        Produces a 2-3 sentence explanation of why this team composition makes
        sense. Called after the CSP solver forms teams, before the committee
        approves the rosters.
        """
        members_block = "\n".join(
            f"  - {m['name']} ({m.get('institution', 'unknown')}): "
            f"skills = {', '.join(m.get('skills', [])) or 'not provided'}"
            for m in members
        )

        rules_block = "\n".join(
            f"  - {k}: {v}" for k, v in distribution_rules.items()
        ) or "  (no constraints specified)"

        user_prompt = (
            f"Team name: {team_name}\n\n"
            f"Members:\n{members_block}\n\n"
            f"Distribution rules in effect:\n{rules_block}\n"
        )
        if challenge_area:
            user_prompt += f"\nChallenge area: {challenge_area}\n"

        user_prompt += "\nWrite the 2-3 sentence rationale now."

        return _call_llm(TEAM_RATIONALE_SYSTEM, user_prompt)

    # ── 2. Communication drafting ────────────────────────────────────

    @staticmethod
    def draft_communication(
        stage:           str,             # "welcome" | "evaluation_request" | etc.
        recipient_name:  str,
        recipient_role:  str,             # "participant" | "judge" | "mentor"
        event_name:      str,
        context:         dict,            # stage-specific data
    ) -> dict:
        """
        Drafts an email for the given event stage. Returns:
          {"subject": "...", "body": "..."}

        Supported stages:
          - welcome:            team assignment notification to participants
          - evaluation_request: notify a judge about teams assigned for scoring
          - deadline_reminder:  remind a judge with unsubmitted scorecards
          - results:            final results announcement
          - progression:        invite a qualifying team to the next round
        """
        stage_instructions = {
            "welcome": (
                "This is a welcome + team assignment email to a newly accepted "
                "participant. Congratulate them, share their team details, and "
                "mention next steps. Keep tone celebratory but not gushy."
            ),
            "evaluation_request": (
                "This is a notification to a judge informing them about the team(s) "
                "assigned for evaluation. Include the team count and deadline if "
                "provided. Tone should be respectful of their time."
            ),
            "deadline_reminder": (
                "This is a gentle reminder to a judge who hasn't submitted all "
                "their scorecards. Mention how many are remaining and the deadline. "
                "Tone should be friendly, not pushy."
            ),
            "results": (
                "This is a results announcement to a participant. Be honest about "
                "the outcome — congratulate winners warmly; acknowledge effort "
                "respectfully for non-winners. Mention next steps if applicable."
            ),
            "progression": (
                "This is an invitation to advance to the next round. Congratulate "
                "the team, give them the next steps, and ask them to confirm "
                "participation by the deadline."
            ),
        }
        instruction = stage_instructions.get(
            stage,
            "Write a clear, professional email appropriate to the stage and context."
        )

        context_block = "\n".join(
            f"  - {k}: {v}" for k, v in context.items()
        ) or "  (no additional context)"

        user_prompt = (
            f"Event name: {event_name}\n"
            f"Stage:           {stage}\n"
            f"Recipient name:  {recipient_name}\n"
            f"Recipient role:  {recipient_role}\n\n"
            f"Stage guidance: {instruction}\n\n"
            f"Context:\n{context_block}\n\n"
            f"Draft the email now."
        )

        raw = _call_llm(COMMUNICATION_SYSTEM, user_prompt)
        parsed = _extract_json(raw)

        if "subject" not in parsed or "body" not in parsed:
            raise ValueError(
                f"LLM response missing 'subject' or 'body'. Got keys: {list(parsed.keys())}"
            )

        return {
            "subject": str(parsed["subject"]).strip(),
            "body":    str(parsed["body"]).strip(),
        }

    # ── 3. Evaluation rubric ─────────────────────────────────────────

    @staticmethod
    def generate_evaluation_rubric(
        challenge_area: str,
        criteria:       Dict[str, float],    # {"innovation": 0.25, ...}
        event_name:     str = "the event",
        team_context:   Optional[dict] = None,
    ) -> dict:
        """
        Produces a structured rubric for judges. Returns:
          {"criteria": [{name, weight, description, what_to_look_for, scoring_guide}, ...]}
        """
        if not criteria:
            raise ValueError("At least one criterion is required.")
        if abs(sum(criteria.values()) - 1.0) > 0.01:
            # Not fatal — Gemini handles non-normalized weights — but warn
            pass

        criteria_block = "\n".join(
            f"  - {name} (weight {weight})" for name, weight in criteria.items()
        )

        user_prompt = (
            f"Event: {event_name}\n"
            f"Challenge area: {challenge_area}\n\n"
            f"Grading criteria (with weights):\n{criteria_block}\n"
        )
        if team_context:
            ctx = "\n".join(f"  - {k}: {v}" for k, v in team_context.items())
            user_prompt += f"\nTeam context:\n{ctx}\n"

        user_prompt += "\nProduce the rubric JSON now."

        raw = _call_llm(RUBRIC_SYSTEM, user_prompt)
        parsed = _extract_json(raw)

        if "criteria" not in parsed or not isinstance(parsed["criteria"], list):
            raise ValueError(
                f"LLM response missing 'criteria' list. Got: {list(parsed.keys())}"
            )

        # Light validation — make sure each entry has the expected keys
        required_keys = {"name", "weight", "description", "what_to_look_for", "scoring_guide"}
        for i, entry in enumerate(parsed["criteria"]):
            missing = required_keys - set(entry.keys())
            if missing:
                raise ValueError(
                    f"Criterion #{i} ({entry.get('name', '?')}) missing keys: {missing}"
                )

        return parsed

    # ── 4. Anomaly explanation ───────────────────────────────────────

    @staticmethod
    def explain_anomaly(
        anomaly:        dict,             # output of Anomaly.to_dict() or AnomalyOut
        team_name:      str,
        evaluator_name: Optional[str] = None,
    ) -> str:
        """
        Turns a statistical anomaly into a committee-friendly narrative.
        The anomaly detector already produces a templated explanation; this
        is a richer LLM-written version for the dashboard's anomaly review.
        """
        evaluator = evaluator_name or anomaly.get("judge_id", "the evaluator")

        details = (
            f"Anomaly kind:     {anomaly.get('kind')}\n"
            f"Severity:         {anomaly.get('severity')}\n"
            f"Evaluator:        {evaluator}\n"
            f"Team:             {team_name}\n"
            f"Score given:      {anomaly.get('score')}\n"
            f"Panel expectation:{anomaly.get('expected')}\n"
            f"Metric value:     {anomaly.get('metric')}\n"
            f"Threshold:        {anomaly.get('threshold')}\n"
            f"System note:      {anomaly.get('explanation', '')}\n"
        )

        user_prompt = (
            f"A statistical anomaly was flagged. Here are the details:\n\n{details}\n"
            f"Write the 2-3 sentence committee-friendly explanation now."
        )

        return _call_llm(ANOMALY_EXPLANATION_SYSTEM, user_prompt)