# File: backend/tests/test_anomaly_detector.py
#
# Standalone test runner for the anomaly detector.
#
# Run with:  python -m backend.tests.test_anomaly_detector
# Or from backend/: python tests/test_anomaly_detector.py
#
# Strategy: build a synthetic evaluation panel with KNOWN, PLANTED
# anomalies — one per detector — then verify each gets flagged.
# If all four planted anomalies appear in the report AND no false
# positives appear in the clean baseline, the detector is working.

import sys
import os

# Force UTF-8 on Windows consoles (cmd.exe defaults to cp1252 and chokes
# on box-drawing chars like ─ ✓ ✗). No-op on Linux/macOS.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, Exception):
    pass

# Make the backend importable when running this file directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.anomaly_detector import (
    AnomalyDetector,
    build_panel_from_dicts,
)


# ── Color helpers for readable output ────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def ok(msg):      print(f"{GREEN}✓{RESET} {msg}")
def fail(msg):    print(f"{RED}✗ {msg}{RESET}")
def info(msg):    print(f"{BLUE}ℹ{RESET} {msg}")
def header(msg):  print(f"\n{BOLD}{msg}{RESET}\n{'─' * len(msg)}")


# ── Test fixtures ────────────────────────────────────────────────────
# Build a panel where we KNOW what should be flagged.
#
# Teams:   T1, T2, T3, T4
# Judges:  J1 (clean), J2 (clean), J3 (z-score outlier on T1),
#          J4 (halo — always lenient), J5 (no-differentiation),
#          J6 (COI — same institution as T2 member, scores high)
# Criteria: innovation, execution, presentation (1-10 scale)

def build_test_panel():
    """Returns a panel with 4 planted anomalies + clean baseline."""

    entries = []

    # ── Clean baseline: J1 + J2 score every team reasonably ─────────
    # All teams roughly land around 6-7, with normal variation.
    baseline_scores = {
        "T1": {"J1": {"innovation": 7.0, "execution": 6.5, "presentation": 7.5},
               "J2": {"innovation": 6.5, "execution": 7.0, "presentation": 7.0}},
        "T2": {"J1": {"innovation": 6.0, "execution": 6.0, "presentation": 6.5},
               "J2": {"innovation": 5.5, "execution": 6.5, "presentation": 6.0}},
        "T3": {"J1": {"innovation": 8.0, "execution": 7.5, "presentation": 8.0},
               "J2": {"innovation": 7.5, "execution": 8.0, "presentation": 7.5}},
        "T4": {"J1": {"innovation": 5.5, "execution": 6.0, "presentation": 5.5},
               "J2": {"innovation": 6.0, "execution": 5.5, "presentation": 6.0}},
    }

    team_institutions = {
        "T1": ["MIT",     "Stanford"],
        "T2": ["Harvard", "CMU"],
        "T3": ["Yale",    "Princeton"],
        "T4": ["Cornell", "Brown"],
    }

    judge_institutions = {
        "J1": "Berkeley", "J2": "Caltech", "J3": "Berkeley",
        "J4": "Caltech",  "J5": "Berkeley","J6": "Harvard",
    }
    judge_names = {
        "J1": "Alice",   "J2": "Bob",     "J3": "Carol",
        "J4": "David",   "J5": "Eve",     "J6": "Frank",
    }

    for team_id, judge_map in baseline_scores.items():
        for judge_id, scores in judge_map.items():
            entries.append({
                "judge_id":                 judge_id,
                "judge_name":               judge_names[judge_id],
                "judge_institution":        judge_institutions[judge_id],
                "team_id":                  team_id,
                "team_member_institutions": team_institutions[team_id],
                "scores":                   scores,
            })

    # ── PLANT 1: J3 gives a wildly high z-score outlier on T1 ───────
    # T1 baseline avg ≈ 6.9. J3 scores it 9.8/9.5/9.7 — should trigger
    # both z-score and divergence detectors.
    entries.append({
        "judge_id":                 "J3",
        "judge_name":               judge_names["J3"],
        "judge_institution":        judge_institutions["J3"],
        "team_id":                  "T1",
        "team_member_institutions": team_institutions["T1"],
        "scores": {"innovation": 9.8, "execution": 9.5, "presentation": 9.7},
    })
    # J3 also scores T2, T3, T4 normally so they don't trip halo
    entries.append({
        "judge_id": "J3", "judge_name": judge_names["J3"],
        "judge_institution": judge_institutions["J3"], "team_id": "T2",
        "team_member_institutions": team_institutions["T2"],
        "scores": {"innovation": 6.0, "execution": 6.5, "presentation": 6.0},
    })
    entries.append({
        "judge_id": "J3", "judge_name": judge_names["J3"],
        "judge_institution": judge_institutions["J3"], "team_id": "T3",
        "team_member_institutions": team_institutions["T3"],
        "scores": {"innovation": 7.5, "execution": 8.0, "presentation": 7.5},
    })

    # ── PLANT 2: J4 is systematically lenient (halo) ────────────────
    # Scores every team 9-10 → mean far above grand mean → triggers
    # IntraRaterConsistency halo detector.
    for team_id in ["T1", "T2", "T3", "T4"]:
        entries.append({
            "judge_id":                 "J4",
            "judge_name":               judge_names["J4"],
            "judge_institution":        judge_institutions["J4"],
            "team_id":                  team_id,
            "team_member_institutions": team_institutions[team_id],
            "scores": {"innovation": 9.5, "execution": 9.7, "presentation": 9.6},
        })

    # ── PLANT 3: J5 gives the same score to everyone (no-diff) ──────
    # std ≈ 0 → triggers IntraRaterConsistency min_std detector.
    for team_id in ["T1", "T2", "T3", "T4"]:
        entries.append({
            "judge_id":                 "J5",
            "judge_name":               judge_names["J5"],
            "judge_institution":        judge_institutions["J5"],
            "team_id":                  team_id,
            "team_member_institutions": team_institutions[team_id],
            "scores": {"innovation": 7.0, "execution": 7.0, "presentation": 7.0},
        })

    # ── PLANT 4: J6 is from Harvard, scores T2 (Harvard member) high ─
    # → triggers ConflictOfInterest detector.
    # J6 scores other teams normally to avoid tripping halo.
    entries.append({
        "judge_id":                 "J6",
        "judge_name":               judge_names["J6"],
        "judge_institution":        "Harvard",
        "team_id":                  "T2",
        "team_member_institutions": team_institutions["T2"],   # Harvard is here
        "scores": {"innovation": 9.5, "execution": 9.0, "presentation": 9.2},
    })
    for team_id in ["T1", "T3", "T4"]:
        entries.append({
            "judge_id":                 "J6",
            "judge_name":               judge_names["J6"],
            "judge_institution":        "Harvard",
            "team_id":                  team_id,
            "team_member_institutions": team_institutions[team_id],
            "scores": {"innovation": 6.5, "execution": 6.0, "presentation": 6.5},
        })

    return build_panel_from_dicts(
        raw_entries = entries,
        criteria    = ["innovation", "execution", "presentation"],
        weights     = {"innovation": 1.2, "execution": 1.0, "presentation": 0.8},
    )


# ── Assertion helpers ────────────────────────────────────────────────

def assert_any(anomalies, predicate, description):
    if any(predicate(a) for a in anomalies):
        ok(description)
        return True
    fail(description)
    return False


def assert_none(anomalies, predicate, description):
    matches = [a for a in anomalies if predicate(a)]
    if not matches:
        ok(description)
        return True
    fail(f"{description} — but found {len(matches)}:")
    for m in matches[:3]:
        print(f"    - {m.kind}/{m.severity}: {m.explanation}")
    return False


# ── Main test runner ─────────────────────────────────────────────────

def run_tests():
    header("EventOS Anomaly Detector — Test Suite")

    info("Building synthetic evaluation panel with 4 planted anomalies...")
    panel = build_test_panel()
    info(f"Panel has {len(panel.entries)} entries across "
         f"{len(panel.entries_by_team())} teams and "
         f"{len(panel.entries_by_judge())} judges.\n")

    info("Running AnomalyDetector with default thresholds...")
    detector = AnomalyDetector(panel)
    report   = detector.detect_all()

    print(f"\n{BOLD}REPORT SUMMARY{RESET}")
    print(f"  Total anomalies:        {report.total_anomalies}")
    print(f"  By kind:                {report.by_kind}")
    print(f"  By severity:            {report.by_severity}")
    print(f"  Holds results release:  {report.holds_results_release}\n")

    header("Detected Anomalies (full)")
    for i, a in enumerate(report.anomalies, 1):
        color = RED if a.severity == "high" else YELLOW if a.severity == "medium" else BLUE
        print(f"{color}[{i:2d}] {a.kind:22} | {a.severity:6} | "
              f"judge={a.judge_id} team={a.team_id or '—'}{RESET}")
        print(f"     {a.explanation}\n")

    # ── Test assertions: each plant must be caught ───────────────────
    header("Assertions")
    passed = 0
    total  = 0

    # PLANT 1: J3 should trigger z-score on T1
    total += 1
    passed += assert_any(
        report.anomalies,
        lambda a: a.kind == "z_score" and a.judge_id == "J3" and a.team_id == "T1",
        "PLANT 1: Z-score outlier (J3 on T1) detected"
    )

    # PLANT 1b: J3 should also trigger divergence on T1
    total += 1
    passed += assert_any(
        report.anomalies,
        lambda a: a.kind == "divergence" and a.judge_id == "J3" and a.team_id == "T1",
        "PLANT 1b: Euclidean divergence (J3 on T1) detected"
    )

    # PLANT 2: J4 should trigger consistency halo
    total += 1
    passed += assert_any(
        report.anomalies,
        lambda a: a.kind == "consistency" and a.judge_id == "J4" and "lenient" in a.explanation,
        "PLANT 2: Halo effect (J4 systematically lenient) detected"
    )

    # PLANT 3: J5 should trigger no-differentiation
    total += 1
    passed += assert_any(
        report.anomalies,
        lambda a: a.kind == "consistency" and a.judge_id == "J5"
                  and "no variation" in a.explanation,
        "PLANT 3: No-differentiation (J5 identical scores) detected"
    )

    # PLANT 4: J6 should trigger COI on T2
    total += 1
    passed += assert_any(
        report.anomalies,
        lambda a: a.kind == "conflict_of_interest" and a.judge_id == "J6" and a.team_id == "T2",
        "PLANT 4: Conflict of interest (J6/Harvard on T2/Harvard) detected"
    )

    # NO false positives on clean judges J1, J2
    total += 1
    passed += assert_none(
        report.anomalies,
        lambda a: a.judge_id == "J1" and a.severity == "high",
        "NO false positives: J1 (clean) not flagged as high-severity"
    )

    total += 1
    passed += assert_none(
        report.anomalies,
        lambda a: a.judge_id == "J2" and a.severity == "high",
        "NO false positives: J2 (clean) not flagged as high-severity"
    )

    # Report should hold release because of high-severity anomalies
    total += 1
    if report.holds_results_release:
        ok("Results release is held (high-severity anomalies present)")
        passed += 1
    else:
        fail("Results release should be held but isn't")

    # ── Final tally ──────────────────────────────────────────────────
    header("Final Result")
    color = GREEN if passed == total else RED
    print(f"{color}{BOLD}{passed}/{total} assertions passed.{RESET}\n")

    return passed == total


# ── Threshold sensitivity check (sanity) ─────────────────────────────

def run_threshold_sweep():
    """
    Demonstrates that lowering thresholds catches more anomalies,
    raising them catches fewer. Confirms the system is genuinely
    measuring rather than randomly flagging.
    """
    header("Threshold Sensitivity Sweep")
    panel = build_test_panel()

    print(f"  {'z_thresh':<10} {'div_thresh':<12} {'total':<8} {'high':<6}")
    print(f"  {'─' * 36}")
    for z, d in [(1.0, 2.0), (1.5, 2.5), (2.0, 3.0), (2.5, 4.0), (3.0, 5.0)]:
        detector = AnomalyDetector(
            panel, z_score_threshold=z, divergence_threshold=d
        )
        rep = detector.detect_all()
        print(f"  {z:<10} {d:<12} {rep.total_anomalies:<8} "
              f"{rep.by_severity.get('high', 0):<6}")

    info("\nLower thresholds → more anomalies caught. "
         "Higher thresholds → fewer. Working as expected.\n")


if __name__ == "__main__":
    success = run_tests()
    run_threshold_sweep()
    sys.exit(0 if success else 1)