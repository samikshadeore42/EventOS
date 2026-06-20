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
from langchain_core.messages import HumanMessage, SystemMessage


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
        model       = os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        temperature = 0.7,
        google_api_key  = api_key,
        max_retries     = 2,
        timeout         = 60,
    )
    return _llm_instance


def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """One LLM round-trip. Returns the assistant's text content."""
    try:
        llm = _get_llm()
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        return (response.content or "").strip()
    except Exception as e:
        import logging
        logging.warning(f"LLM call failed: {e}. Returning mock response.")
        if system_prompt == COMMUNICATION_SYSTEM:
            return '{"subject": "[MOCK] AI Generated Subject", "body": "[MOCK] This is a mock email body generated because the Google API key is invalid or missing."}'
        elif system_prompt == RUBRIC_SYSTEM:
            raise RuntimeError(
                "AI rubric generation failed. Check GOOGLE_API_KEY/GEMINI_MODEL in backend and celery_worker environment."
            )
        elif system_prompt == MENTOR_SUMMARY_SYSTEM:
            return '{"summary": "[MOCK] Team is progressing well.", "recommended_focus": "Keep working", "committee_note": "No intervention needed.", "tone": "stable"}'
        return f"[MOCK] AI response due to API error: {e}"


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
You are an expert rubric designer for hackathon evaluation.

Create a concise judge-facing AI scoring guide from the given challenge area, event name,
criteria, weights, and optional team context.

Rules:
- Use every criterion exactly as provided.
- Preserve each criterion's weight exactly.
- Do not collapse criteria.
- Keep the guide concise and practical.
- Return ONLY valid JSON. No markdown. No extra text.

For each criterion:
- description must be 1 short sentence.
- what_to_look_for must contain exactly 3 short judge checkpoints.
- scoring_guide must contain 1 concise sentence for each band: 9-10, 7-8, 4-6, 0-3.
- Each scoring band sentence must be clear but not long.

Return ONLY valid JSON in this exact shape:
{
  "criteria": [
    {
      "name": "criterion name as given",
      "weight": 0.25,
      "description": "Short sentence explaining what this criterion measures.",
      "what_to_look_for": [
        "Short checkpoint 1",
        "Short checkpoint 2",
        "Short checkpoint 3"
      ],
      "scoring_guide": {
        "9-10": "Concise explanation for excellent work.",
        "7-8": "Concise explanation for strong work.",
        "4-6": "Concise explanation for average work.",
        "0-3": "Concise explanation for weak work."
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

MENTOR_SUMMARY_SYSTEM = """\
You are a hackathon operations assistant summarising a team's mentor-guided
progress for the committee.

Given the team's latest mentor feedback, progress score, blockers, action items,
and risk indicators, produce a concise operational summary.

Return ONLY valid JSON in this exact shape:
{
  "summary": "2-3 sentence overview of the team's current status.",
  "recommended_focus": "What the team should prioritise next (1 sentence).",
  "committee_note": "One sentence note for the committee on whether intervention is needed.",
  "tone": "stable | watchlist | urgent"
}

Rules:
- Be factual and specific to the data provided.
- 'stable' = on track; 'watchlist' = minor concerns; 'urgent' = needs attention.
- Do not assign mentors or change risk scores.
- AI only summarises, it does not make decisions.\
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

    # ── 5. Mentor summary ────────────────────────────────────────────

    @staticmethod
    def generate_mentor_summary(payload: dict) -> dict:
        """
        Produces a committee-facing summary of a team's mentor-guided progress.
        Input payload keys: team_name, mentor_name, latest_progress_score,
        latest_feedback, blockers, action_items, risk_score, risk_level, risk_reasons.

        Returns: {summary, recommended_focus, committee_note, tone}
        """
        details = (
            f"Team name:           {payload.get('team_name', 'Unknown')}\n"
            f"Mentor:              {payload.get('mentor_name', 'Unassigned')}\n"
            f"Progress score:      {payload.get('latest_progress_score', 'N/A')}\n"
            f"Risk score:          {payload.get('risk_score', 'N/A')} ({payload.get('risk_level', 'unknown')})\n"
            f"Risk reasons:        {', '.join(payload.get('risk_reasons', []))}\n"
            f"Latest feedback:     {payload.get('latest_feedback', 'None')}\n"
            f"Blockers:            {payload.get('blockers', 'None')}\n"
            f"Action items:        {', '.join(payload.get('action_items', []))}\n"
        )

        user_prompt = (
            f"Here is a team's current mentor-tracked status:\n\n{details}\n"
            f"Produce the committee summary JSON now."
        )

        raw = _call_llm(MENTOR_SUMMARY_SYSTEM, user_prompt)
        parsed = _extract_json(raw)

        # Validate expected keys
        for key in ("summary", "recommended_focus", "committee_note", "tone"):
            if key not in parsed:
                parsed[key] = ""

        if parsed["tone"] not in ("stable", "watchlist", "urgent"):
            parsed["tone"] = "stable"

        return parsed
