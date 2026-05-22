# File: backend/tests/test_anomaly_api.py
#
# INTEGRATION TEST for the anomaly detection API.
#
# Unlike test_anomaly_detector.py (which tests the service in isolation),
# this test hits the live HTTP server, enqueues a real Celery task, polls
# for completion, and verifies the report comes back over the wire.
#
# PREREQUISITES — the full stack must be running:
#   docker-compose up        (or however your team brings up the stack)
#
# The script checks that:
#   - FastAPI is up    (GET /health)
#   - Redis is up      (returned in /health)
#   - Celery worker is up (we'll know when the task actually completes)
#
# Run with:  python tests/test_anomaly_api.py
# Or set a custom URL:  BASE_URL=http://api.local:8000 python tests/test_anomaly_api.py

import os
import sys
import time

# Force UTF-8 stdout on Windows
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, Exception):
    pass

try:
    import requests
except ImportError:
    print("This test needs `requests`. Install with: pip install requests")
    sys.exit(1)


BASE_URL    = os.environ.get("BASE_URL", "http://localhost:8000")
POLL_TIMEOUT_SECONDS  = 30
POLL_INTERVAL_SECONDS = 1


# ── Color helpers (auto-disable when stdout isn't a real terminal) ────

_USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None
if _USE_COLOR:
    GREEN, RED, YELLOW, BLUE, BOLD, RESET = (
        "\033[92m", "\033[91m", "\033[93m", "\033[94m", "\033[1m", "\033[0m"
    )
else:
    GREEN = RED = YELLOW = BLUE = BOLD = RESET = ""

def ok(m):     print(f"{GREEN}✓{RESET} {m}")
def fail(m):   print(f"{RED}✗ {m}{RESET}")
def info(m):   print(f"{BLUE}ℹ{RESET} {m}")
def header(m): print(f"\n{BOLD}{m}{RESET}\n{'─' * len(m)}")


# ── Test fixture — same planted-anomaly panel as the unit test ───────
# Reusing the same data means we KNOW exactly what should be flagged.

def build_request_payload():
    """Same scoring data as test_anomaly_detector.py, in HTTP-friendly form."""

    judges = {
        "J1": ("Alice",  "Berkeley"),  "J2": ("Bob",    "Caltech"),
        "J3": ("Carol",  "Berkeley"),  "J4": ("David",  "Caltech"),
        "J5": ("Eve",    "Berkeley"),  "J6": ("Frank",  "Harvard"),
    }
    team_institutions = {
        "T1": ["MIT", "Stanford"],  "T2": ["Harvard", "CMU"],
        "T3": ["Yale", "Princeton"],"T4": ["Cornell", "Brown"],
    }

    def entry(judge_id, team_id, scores):
        name, inst = judges[judge_id]
        return {
            "judge_id":                 judge_id,
            "judge_name":               name,
            "judge_institution":        inst,
            "team_id":                  team_id,
            "team_member_institutions": team_institutions[team_id],
            "scores":                   scores,
        }

    entries = []

    # Clean baseline: J1 + J2 on every team
    baseline = {
        "T1": {"J1": (7.0, 6.5, 7.5), "J2": (6.5, 7.0, 7.0)},
        "T2": {"J1": (6.0, 6.0, 6.5), "J2": (5.5, 6.5, 6.0)},
        "T3": {"J1": (8.0, 7.5, 8.0), "J2": (7.5, 8.0, 7.5)},
        "T4": {"J1": (5.5, 6.0, 5.5), "J2": (6.0, 5.5, 6.0)},
    }
    for team_id, jmap in baseline.items():
        for jid, (inn, exe, pre) in jmap.items():
            entries.append(entry(jid, team_id, {
                "innovation": inn, "execution": exe, "presentation": pre
            }))

    # PLANT 1: J3 outlier high on T1
    entries.append(entry("J3", "T1", {"innovation": 9.8, "execution": 9.5, "presentation": 9.7}))
    entries.append(entry("J3", "T2", {"innovation": 6.0, "execution": 6.5, "presentation": 6.0}))
    entries.append(entry("J3", "T3", {"innovation": 7.5, "execution": 8.0, "presentation": 7.5}))

    # PLANT 2: J4 systematically lenient (halo)
    for team_id in ["T1", "T2", "T3", "T4"]:
        entries.append(entry("J4", team_id,
            {"innovation": 9.5, "execution": 9.7, "presentation": 9.6}))

    # PLANT 3: J5 gives identical scores to everyone (no-differentiation)
    for team_id in ["T1", "T2", "T3", "T4"]:
        entries.append(entry("J5", team_id,
            {"innovation": 7.0, "execution": 7.0, "presentation": 7.0}))

    # PLANT 4: J6 (Harvard) scores T2 (has Harvard member) high — COI
    entries.append(entry("J6", "T2", {"innovation": 9.5, "execution": 9.0, "presentation": 9.2}))
    for team_id in ["T1", "T3", "T4"]:
        entries.append(entry("J6", team_id,
            {"innovation": 6.5, "execution": 6.0, "presentation": 6.5}))

    return {
        "entries":  entries,
        "criteria": ["innovation", "execution", "presentation"],
        "weights":  {"innovation": 1.2, "execution": 1.0, "presentation": 0.8},
        "config":   {
            "z_score_threshold":    2.0,
            "divergence_threshold": 3.0,
            "consistency_min_std":  0.5,
            "halo_threshold":       2.0,
            "coi_bias_threshold":   1.5,
        }
    }


# ── HTTP helpers ─────────────────────────────────────────────────────

def check_server_alive():
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code == 200:
            data = r.json()
            redis_ok = data.get("redis", False)
            ok(f"Server is up at {BASE_URL}")
            if redis_ok:
                ok("Redis connection is healthy")
            else:
                fail("Redis is NOT healthy — Celery task will fail to enqueue")
                return False
            return True
        fail(f"Health check returned {r.status_code}")
        return False
    except requests.RequestException as e:
        fail(f"Cannot reach {BASE_URL}: {e}")
        info("Is the FastAPI server running? Try: docker-compose up")
        return False


def enqueue_detection(payload):
    r = requests.post(f"{BASE_URL}/anomalies/detect", json=payload, timeout=10)
    if r.status_code != 202:
        fail(f"POST /anomalies/detect returned {r.status_code}: {r.text}")
        return None
    body = r.json()
    ok(f"Task enqueued: {body['task_id']}")
    info(f"  {body['message']}")
    return body["task_id"]


def poll_until_done(task_id):
    """Polls /tasks/{task_id}/status until success or timeout."""
    start  = time.time()
    last_progress = -1

    while time.time() - start < POLL_TIMEOUT_SECONDS:
        r = requests.get(f"{BASE_URL}/tasks/{task_id}/status", timeout=5)
        if r.status_code != 200:
            fail(f"Status poll returned {r.status_code}: {r.text}")
            return None

        data     = r.json()
        status   = data["status"]
        progress = data["progress"]
        total    = data["total_steps"]
        message  = data["message"]

        if progress != last_progress:
            info(f"  [{progress}/{total}] {status:<8} | {message}")
            last_progress = progress

        if status == "success":
            elapsed = time.time() - start
            ok(f"Task completed in {elapsed:.2f}s")
            return data
        if status == "failed":
            fail(f"Task failed: {data.get('error', 'unknown')}")
            return None

        time.sleep(POLL_INTERVAL_SECONDS)

    fail(f"Task timed out after {POLL_TIMEOUT_SECONDS}s — is the Celery worker running?")
    return None


def fetch_report(task_id):
    r = requests.get(f"{BASE_URL}/anomalies/report/{task_id}", timeout=10)
    if r.status_code != 200:
        fail(f"GET /anomalies/report/{task_id} returned {r.status_code}: {r.text}")
        return None
    ok("Report fetched successfully")
    return r.json()


# ── Assertions ───────────────────────────────────────────────────────

def assert_contains(anomalies, predicate, description):
    if any(predicate(a) for a in anomalies):
        ok(description)
        return True
    fail(description)
    return False


# ── Main runner ──────────────────────────────────────────────────────

def main():
    header(f"EventOS Anomaly API Integration Test — {BASE_URL}")

    if not check_server_alive():
        return 1

    header("Step 1: Enqueue detection")
    payload = build_request_payload()
    info(f"Payload: {len(payload['entries'])} entries, "
         f"{len(payload['criteria'])} criteria")

    task_id = enqueue_detection(payload)
    if not task_id:
        return 1

    header("Step 2: Poll for completion")
    final_status = poll_until_done(task_id)
    if not final_status:
        return 1

    header("Step 3: Fetch the full report")
    report = fetch_report(task_id)
    if not report:
        return 1

    print(f"\n{BOLD}REPORT SUMMARY{RESET}")
    print(f"  Total anomalies:        {report['total_anomalies']}")
    print(f"  By kind:                {report['by_kind']}")
    print(f"  By severity:            {report['by_severity']}")
    print(f"  Holds results release:  {report['holds_results_release']}\n")

    header("Step 4: Verify planted anomalies are in the report")
    anomalies = report["anomalies"]
    passed = 0
    total  = 0

    total += 1
    passed += assert_contains(anomalies,
        lambda a: a["kind"] == "z_score" and a["judge_id"] == "J3" and a["team_id"] == "T1",
        "PLANT 1: Z-score outlier (J3 on T1) present in report")

    total += 1
    passed += assert_contains(anomalies,
        lambda a: a["kind"] == "consistency" and a["judge_id"] == "J4" and "lenient" in a["explanation"],
        "PLANT 2: Halo effect (J4 lenient) present in report")

    total += 1
    passed += assert_contains(anomalies,
        lambda a: a["kind"] == "consistency" and a["judge_id"] == "J5" and "no variation" in a["explanation"],
        "PLANT 3: No-differentiation (J5) present in report")

    total += 1
    passed += assert_contains(anomalies,
        lambda a: a["kind"] == "conflict_of_interest" and a["judge_id"] == "J6" and a["team_id"] == "T2",
        "PLANT 4: Conflict of interest (J6/Harvard on T2) present in report")

    total += 1
    if report["holds_results_release"]:
        ok("holds_results_release is True (correct — there are high-severity anomalies)")
        passed += 1
    else:
        fail("holds_results_release should be True")

    header("Step 5: Verify error handling for missing/bad task IDs")

    total += 1
    r = requests.get(f"{BASE_URL}/anomalies/report/nonexistent-task-id-xyz", timeout=5)
    if r.status_code == 404:
        ok("404 returned for missing task_id (correct)")
        passed += 1
    else:
        fail(f"Expected 404 for missing task_id, got {r.status_code}")

    total += 1
    bad_payload = build_request_payload()
    bad_payload["entries"][0]["scores"] = {"wrong_criterion": 5.0}
    r = requests.post(f"{BASE_URL}/anomalies/detect", json=bad_payload, timeout=5)
    if r.status_code == 422:
        ok("422 returned for mismatched criteria (correct)")
        passed += 1
    else:
        fail(f"Expected 422 for bad payload, got {r.status_code}: {r.text[:200]}")

    header("Final Result")
    color = GREEN if passed == total else RED
    print(f"{color}{BOLD}{passed}/{total} integration checks passed.{RESET}\n")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())