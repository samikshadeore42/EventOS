# File: backend/tests/test_ai_smoke.py
#
# Standalone smoke test for the AI generation module.
# Tests all 4 LLM methods directly — no Docker, Celery, or database needed.
#
# Run from the backend/ directory:
#   python tests/test_ai_smoke.py
#
# Requires GOOGLE_API_KEY in backend/.env (or set as environment variable).

import sys
import os

# Force UTF-8 on Windows consoles
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── Load .env manually (since we're not running inside Docker) ────────
# Walks up from this file's location to find .env
def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for folder in [here, os.path.join(here, ".."), os.path.join(here, "..", "..")]:
        env_path = os.path.join(folder, ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, val = line.partition("=")
                        os.environ.setdefault(key.strip(), val.strip())
            print(f"Loaded .env from: {os.path.abspath(env_path)}\n")
            return
    print("WARNING: No .env file found. Relying on system environment variables.\n")

load_env()

# Make app importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ai_service import AIService

# ── Color helpers ─────────────────────────────────────────────────────
_USE_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
G = "\033[92m" if _USE_COLOR else ""
R = "\033[91m" if _USE_COLOR else ""
Y = "\033[93m" if _USE_COLOR else ""
B = "\033[1m"  if _USE_COLOR else ""
X = "\033[0m"  if _USE_COLOR else ""

def ok(m):    print(f"{G}PASS{X}  {m}")
def fail(m):  print(f"{R}FAIL{X}  {m}")
def section(m): print(f"\n{B}{m}{X}\n{'─'*len(m)}")


# ── Test 1: Team Rationale ─────────────────────────────────────────────
def test_team_rationale():
    section("Test 1: Team Rationale Generator")
    print("Sending team data to Gemini...")
    try:
        result = AIService.generate_team_rationale(
            team_name = "Team Atlas",
            members   = [
                {"name": "Alice Chen",  "institution": "MIT",        "skills": ["machine learning", "Python"]},
                {"name": "Ravi Kumar",  "institution": "IIT Bombay", "skills": ["frontend", "React"]},
                {"name": "Mei Tanaka",  "institution": "ETH Zurich", "skills": ["backend", "databases"]},
            ],
            distribution_rules = {
                "team_size":           3,
                "max_per_institution": 1,
                "skill_balance":       True,
            },
            challenge_area = "AI-powered climate solutions",
        )

        if result and len(result) > 30:
            ok(f"Got rationale ({len(result)} chars)")
            print(f"\n{Y}Output:{X}")
            print(f'  "{result}"\n')
            return True
        else:
            fail(f"Response too short or empty: {repr(result)}")
            return False
    except RuntimeError as e:
        fail(f"Config error: {e}")
        return False
    except Exception as e:
        fail(f"Unexpected error: {type(e).__name__}: {e}")
        return False


# ── Test 2: Email Drafting ─────────────────────────────────────────────
def test_email_drafting():
    section("Test 2: Email Drafter (welcome stage)")
    print("Asking Gemini to draft a welcome email...")
    try:
        result = AIService.draft_communication(
            stage          = "welcome",
            recipient_name = "Alice Chen",
            recipient_role = "participant",
            event_name     = "WiSE@TI Hackathon 2025",
            context        = {
                "team_name":  "Team Atlas",
                "teammates":  ["Ravi Kumar", "Mei Tanaka"],
                "challenge":  "AI-powered climate solutions",
                "start_date": "2025-12-15",
            },
        )

        if isinstance(result, dict) and "subject" in result and "body" in result:
            ok(f"Got email with subject + body")
            print(f"\n{Y}Subject:{X} {result['subject']}")
            print(f"{Y}Body preview:{X}")
            preview = result["body"][:300].replace("\n", "\n  ")
            print(f"  {preview}...\n")
            return True
        else:
            fail(f"Unexpected response shape: {result}")
            return False
    except Exception as e:
        fail(f"{type(e).__name__}: {e}")
        return False


# ── Test 3: Evaluation Rubric ──────────────────────────────────────────
def test_rubric():
    section("Test 3: Evaluation Rubric Generator")
    print("Asking Gemini to generate a judge rubric...")
    try:
        result = AIService.generate_evaluation_rubric(
            challenge_area = "AI-powered climate solutions",
            criteria       = {
                "technical_depth": 0.35,
                "innovation":      0.25,
                "presentation":    0.20,
                "feasibility":     0.20,
            },
            event_name     = "WiSE@TI Hackathon 2025",
        )

        if "criteria" in result and len(result["criteria"]) > 0:
            first = result["criteria"][0]
            ok(f"Got rubric with {len(result['criteria'])} criteria")
            print(f"\n{Y}First criterion — {first.get('name','?')}:{X}")
            print(f"  Description:       {first.get('description','')[:100]}")
            print(f"  What to look for:  {first.get('what_to_look_for',['?'])[0]}")
            sg = first.get('scoring_guide', {})
            if sg:
                band, desc = next(iter(sg.items()))
                print(f"  Score {band}:  {str(desc)[:80]}")
            print()
            return True
        else:
            fail(f"Unexpected response shape: {result}")
            return False
    except Exception as e:
        fail(f"{type(e).__name__}: {e}")
        return False


# ── Test 4: Anomaly Explanation ────────────────────────────────────────
def test_anomaly_explanation():
    section("Test 4: Anomaly Explanation Generator")
    print("Asking Gemini to explain a flagged anomaly...")
    try:
        result = AIService.explain_anomaly(
            anomaly = {
                "kind":        "z_score",
                "severity":    "high",
                "judge_id":    "J3",
                "team_id":     "T1",
                "score":       9.8,
                "expected":    5.1,
                "metric":      2.4,
                "threshold":   2.0,
                "explanation": "Judge Carol scored team T1 9.80 — panel mean 5.10 (z=2.40sigma).",
            },
            team_name      = "Team Atlas",
            evaluator_name = "Carol Singh",
        )

        if result and len(result) > 30:
            ok(f"Got narrative ({len(result)} chars)")
            print(f"\n{Y}Output:{X}")
            print(f'  "{result}"\n')
            return True
        else:
            fail(f"Response too short or empty: {repr(result)}")
            return False
    except Exception as e:
        fail(f"{type(e).__name__}: {e}")
        return False


# ── Main ───────────────────────────────────────────────────────────────
def main():
    print(f"\n{B}EventOS — AI Generation Smoke Test{X}")
    print("Tests all 4 LLM methods directly. No Docker or Celery needed.\n")

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        print(f"{R}ERROR: GOOGLE_API_KEY is not set.{X}")
        print("Add it to backend/.env and re-run.")
        return 1
    print(f"API key found: {api_key[:8]}{'*' * (len(api_key)-12)}{api_key[-4:]}\n")

    results = [
        test_team_rationale(),
        test_email_drafting(),
        test_rubric(),
        test_anomaly_explanation(),
    ]

    passed = sum(results)
    total  = len(results)
    section("Final Result")
    color = G if passed == total else R
    print(f"{color}{B}{passed}/{total} tests passed.{X}\n")

    if passed < total:
        print("Failed tests usually mean:")
        print("  - GOOGLE_API_KEY is wrong or revoked → check aistudio.google.com")
        print("  - LangChain version mismatch → pip install langchain==0.2.1 langchain-google-genai==1.0.6")
        print("  - Network issue → check internet connection\n")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())