# File: backend/app/services/anomaly_detector.py
#
# Anomaly Detection Engine for evaluator scores.
#
# PROBLEM: Multiple judges score multiple teams across multiple criteria.
# Some scores will be off — a judge might be unusually harsh, unusually
# lenient, biased toward their own institution, or just inconsistent.
# We need to flag these BEFORE results are published so the committee
# can review and resolve them.
#
# Architecture spec calls for 4 detection methods:
#   1. Z-score analysis          — per-criterion outlier detection
#   2. Weighted Euclidean divergence — full-vector deviation from panel
#   3. Intra-rater consistency   — is a judge scoring sensibly across teams?
#   4. Conflict-of-interest      — institutional bias detection
#
# DESIGN: Mirror the csp_solver.py pattern:
#   - Dataclasses for inputs / outputs
#   - Static-method utility classes per detection method (bounded modules)
#   - One main AnomalyDetector class that orchestrates and aggregates
#
# All thresholds are configurable per the problem statement requirement.


import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from collections import defaultdict


# ── Data Structures ──────────────────────────────────────────────────

@dataclass
class ScoreEntry:
    """
    One judge's score for one team across multiple criteria.

    Example:
        ScoreEntry(
            judge_id="J1", judge_name="Alice", judge_institution="MIT",
            team_id="T1", team_member_institutions={"MIT", "Stanford"},
            scores={"innovation": 8.5, "execution": 7.0, "presentation": 9.0}
        )
    """
    judge_id:                str
    judge_name:              str
    judge_institution:       str
    team_id:                 str
    team_name:               str
    team_member_institutions: set        # for COI detection
    scores:                  Dict[str, float]   # {"criterion": score}

    @property
    def score_array(self) -> np.ndarray:
        """Numpy view of the scores in deterministic key order."""
        return np.array([self.scores[k] for k in sorted(self.scores.keys())])

    @property
    def criteria(self) -> List[str]:
        return sorted(self.scores.keys())


@dataclass
class EvaluationPanel:
    """
    The full set of scores submitted across all judges and teams.
    Created once per detection run.
    """
    entries:  List[ScoreEntry]
    criteria: List[str]                  # canonical criterion order
    weights:  Optional[Dict[str, float]] = None   # per-criterion weights (for Euclidean)

    def __post_init__(self):
        # Sanity check — every entry must have the same criteria keys
        for e in self.entries:
            if set(e.scores.keys()) != set(self.criteria):
                raise ValueError(
                    f"Entry by {e.judge_id} on team {e.team_id} has criteria "
                    f"{set(e.scores.keys())}, expected {set(self.criteria)}"
                )

        # Default weights = 1.0 for every criterion
        if self.weights is None:
            self.weights = {c: 1.0 for c in self.criteria}

    def entries_by_team(self) -> Dict[str, List[ScoreEntry]]:
        """Group entries by team_id."""
        out: Dict[str, List[ScoreEntry]] = defaultdict(list)
        for e in self.entries:
            out[e.team_id].append(e)
        return dict(out)

    def entries_by_judge(self) -> Dict[str, List[ScoreEntry]]:
        """Group entries by judge_id."""
        out: Dict[str, List[ScoreEntry]] = defaultdict(list)
        for e in self.entries:
            out[e.judge_id].append(e)
        return dict(out)

    def weight_array(self) -> np.ndarray:
        """Weight vector in same order as score_array."""
        return np.array([self.weights[c] for c in sorted(self.criteria)])


@dataclass
class Anomaly:
    """One detected anomaly. Each detector emits zero or more of these."""
    kind:        str    # "z_score" | "divergence" | "consistency" | "conflict_of_interest"
    severity:    str    # "low" | "medium" | "high"
    judge_id:    str
    team_id:     Optional[str]   # None for judge-level anomalies (consistency)
    score:       float
    expected:    float
    metric:      float           # the actual z-score / distance / std
    threshold:   float           # what threshold was crossed
    explanation: str             # plain-English description


# ── Detection Method 1: Z-score Analysis ─────────────────────────────
# For each (team, criterion) pair, compute z-score of each judge's
# score vs the panel mean for that team-criterion. Flag if |z| > threshold.
#
# This catches the canonical case from the problem statement:
#   "Evaluator score for Team Orion is 8.9 vs panel average of 3.8"

class ZScoreDetector:

    @staticmethod
    def detect(
        panel:     EvaluationPanel,
        threshold: float = 2.0
    ) -> List[Anomaly]:
        """
        Returns one Anomaly per (judge, team, criterion) where the judge's
        score is more than `threshold` standard deviations from the panel
        mean for that team-criterion.

        Uses LEAVE-ONE-OUT z-score: for each candidate score, the mean and
        std are computed from the OTHER judges' scores only. This is more
        robust on small panels (typical evaluator count is 3-5), where an
        outlier would otherwise inflate the std and hide itself.
        Falls back to a small-sample tolerance for the std floor.
        """
        anomalies: List[Anomaly] = []
        by_team = panel.entries_by_team()
        STD_FLOOR = 0.3   # If panel agreement is near-perfect, treat std as
                          # at least this much to avoid divide-by-near-zero
                          # exploding the z-score on tiny natural variation.

        for team_id, team_entries in by_team.items():
            if len(team_entries) < 3:
                # Need at least 3 scores so leave-one-out leaves us with ≥ 2
                continue

            for criterion in panel.criteria:
                scores = np.array([e.scores[criterion] for e in team_entries])

                for i, entry in enumerate(team_entries):
                    others = np.delete(scores, i)
                    mean   = float(others.mean())
                    std    = max(float(others.std(ddof=0)), STD_FLOOR)

                    s = entry.scores[criterion]
                    z = abs(s - mean) / std

                    if z > threshold:
                        severity = ZScoreDetector._severity(z, threshold)
                        anomalies.append(Anomaly(
                            kind="z_score",
                            severity=severity,
                            judge_id=entry.judge_id,
                            team_id=team_id,
                            score=float(s),
                            expected=float(mean),
                            metric=float(z),
                            threshold=threshold,
                            explanation=(
                                f"Judge {entry.judge_name} scored team '{entry.team_name}' "
                                f"{s:.2f} on '{criterion}' — panel mean is "
                                f"{mean:.2f} (z={z:.2f}σ, threshold {threshold:.1f}σ)."
                            ),
                        ))
        return anomalies

    @staticmethod
    def _severity(z: float, threshold: float) -> str:
        if z > threshold * 2.0:
            return "high"
        if z > threshold * 1.5:
            return "medium"
        return "low"


# ── Detection Method 2: Weighted Euclidean Divergence ────────────────
# Compares a judge's FULL score vector for a team against the panel mean
# vector — catches cases where no single criterion is wildly off but
# the overall pattern diverges (e.g., a judge consistently 1-2 points
# below panel on every criterion).

class EuclideanDivergenceDetector:

    @staticmethod
    def detect(
        panel:     EvaluationPanel,
        threshold: float = 3.0
    ) -> List[Anomaly]:
        """
        Returns one Anomaly per (judge, team) whose weighted Euclidean
        distance from the panel mean vector exceeds `threshold`.

        Distance is in score units — on a 1-10 scale, threshold=3.0
        means "the judge's overall scoring deviates from the panel by
        ~3 points of combined weighted magnitude."
        """
        anomalies: List[Anomaly] = []
        by_team   = panel.entries_by_team()
        weights   = panel.weight_array()

        for team_id, team_entries in by_team.items():
            if len(team_entries) < 2:
                continue

            vectors    = np.array([e.score_array for e in team_entries])
            mean_vec   = vectors.mean(axis=0)

            for entry in team_entries:
                diff     = entry.score_array - mean_vec
                # Weighted Euclidean: sqrt(Σ w_i * (x_i - μ_i)^2)
                distance = float(np.sqrt(np.sum(weights * diff ** 2)))

                if distance > threshold:
                    severity = EuclideanDivergenceDetector._severity(distance, threshold)
                    anomalies.append(Anomaly(
                        kind="divergence",
                        severity=severity,
                        judge_id=entry.judge_id,
                        team_id=team_id,
                        score=float(entry.score_array.mean()),
                        expected=float(mean_vec.mean()),
                        metric=distance,
                        threshold=threshold,
                        explanation=(
                            f"Judge {entry.judge_name}'s overall score vector for "
                            f"team '{entry.team_name}' diverges from the panel by "
                            f"{distance:.2f} (weighted Euclidean), threshold {threshold:.1f}."
                        ),
                    ))
        return anomalies

    @staticmethod
    def _severity(distance: float, threshold: float) -> str:
        if distance > threshold * 2.0:
            return "high"
        if distance > threshold * 1.5:
            return "medium"
        return "low"


# ── Detection Method 3: Intra-rater Consistency ──────────────────────
# Checks whether a judge is internally consistent across all teams they
# scored. Two failure modes:
#   a) Judge gives near-identical scores to every team (no differentiation)
#   b) Judge's mean is wildly different from the grand panel mean (halo)

class IntraRaterConsistencyDetector:

    @staticmethod
    def detect(
        panel:        EvaluationPanel,
        min_std:      float = 0.5,
        halo_threshold: float = 2.0
    ) -> List[Anomaly]:
        """
        Flags judges who:
          - have std < min_std across all their scores (no differentiation), OR
          - have mean off from the panel grand mean by > halo_threshold
        """
        anomalies: List[Anomaly] = []
        by_judge  = panel.entries_by_judge()

        # Compute panel grand mean (one number — mean of every score ever given)
        all_scores = np.concatenate([e.score_array for e in panel.entries])
        grand_mean = float(all_scores.mean())

        for judge_id, judge_entries in by_judge.items():
            if len(judge_entries) < 2:
                # Can't measure consistency from a single team
                continue

            judge_scores = np.concatenate([e.score_array for e in judge_entries])
            judge_mean   = float(judge_scores.mean())
            judge_std    = float(judge_scores.std(ddof=0))
            judge_name   = judge_entries[0].judge_name

            # --- Failure mode A: no differentiation ---
            if judge_std < min_std:
                anomalies.append(Anomaly(
                    kind="consistency",
                    severity="medium",
                    judge_id=judge_id,
                    team_id=None,
                    score=judge_mean,
                    expected=grand_mean,
                    metric=judge_std,
                    threshold=min_std,
                    explanation=(
                        f"Judge {judge_name} shows almost no variation across "
                        f"teams (std={judge_std:.2f}, threshold {min_std:.2f}). "
                        f"They may not be differentiating between teams."
                    ),
                ))

            # --- Failure mode B: halo / horns ---
            mean_offset = judge_mean - grand_mean
            if abs(mean_offset) > halo_threshold:
                direction = "lenient" if mean_offset > 0 else "harsh"
                anomalies.append(Anomaly(
                    kind="consistency",
                    severity="high" if abs(mean_offset) > halo_threshold * 1.5 else "medium",
                    judge_id=judge_id,
                    team_id=None,
                    score=judge_mean,
                    expected=grand_mean,
                    metric=float(mean_offset),
                    threshold=halo_threshold,
                    explanation=(
                        f"Judge {judge_name}'s average score is {judge_mean:.2f} "
                        f"vs panel grand mean {grand_mean:.2f} "
                        f"(offset {mean_offset:+.2f}, threshold ±{halo_threshold:.1f}). "
                        f"Systematically {direction}."
                    ),
                ))

        return anomalies


# ── Detection Method 4: Conflict of Interest ─────────────────────────
# Flags cases where a judge scored a team unusually high AND shares an
# institution with at least one team member. The architecture spec calls
# this out explicitly as a required detector.

class ConflictOfInterestDetector:

    @staticmethod
    def detect(
        panel:           EvaluationPanel,
        bias_threshold:  float = 1.5      # judge's score must be ≥ this much above panel mean
    ) -> List[Anomaly]:
        """
        Returns Anomalies where:
          - judge.institution ∈ team.member_institutions, AND
          - judge's mean score for that team is ≥ bias_threshold above
            the panel mean for that team
        """
        anomalies: List[Anomaly] = []
        by_team   = panel.entries_by_team()

        for team_id, team_entries in by_team.items():
            if len(team_entries) < 2:
                continue

            team_means = np.array([float(e.score_array.mean()) for e in team_entries])
            panel_mean = float(team_means.mean())

            for i, entry in enumerate(team_entries):
                if entry.judge_institution not in entry.team_member_institutions:
                    continue

                judge_mean_for_team = float(team_means[i])
                bias = judge_mean_for_team - panel_mean

                if bias >= bias_threshold:
                    anomalies.append(Anomaly(
                        kind="conflict_of_interest",
                        severity="high",
                        judge_id=entry.judge_id,
                        team_id=team_id,
                        score=judge_mean_for_team,
                        expected=panel_mean,
                        metric=bias,
                        threshold=bias_threshold,
                        explanation=(
                            f"Judge {entry.judge_name} ({entry.judge_institution}) "
                            f"shares an institution with a member of team '{entry.team_name}' "
                            f"and scored them {judge_mean_for_team:.2f} vs panel "
                            f"mean {panel_mean:.2f} (bias +{bias:.2f}, threshold "
                            f"+{bias_threshold:.1f})."
                        ),
                    ))
        return anomalies


# ── Main Orchestrator ────────────────────────────────────────────────

@dataclass
class AnomalyReport:
    """Aggregated output of a full detection run."""
    total_anomalies:       int
    by_kind:               Dict[str, int]
    by_severity:           Dict[str, int]
    holds_results_release: bool
    anomalies:             List[Anomaly] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialize for JSON / API response."""
        return {
            "total_anomalies":       self.total_anomalies,
            "by_kind":               self.by_kind,
            "by_severity":           self.by_severity,
            "holds_results_release": self.holds_results_release,
            "anomalies": [
                {
                    "kind":        a.kind,
                    "severity":    a.severity,
                    "judge_id":    a.judge_id,
                    "team_id":     a.team_id,
                    "score":       round(a.score, 3),
                    "expected":    round(a.expected, 3),
                    "metric":      round(a.metric, 3),
                    "threshold":   round(a.threshold, 3),
                    "explanation": a.explanation,
                }
                for a in self.anomalies
            ],
        }


class AnomalyDetector:
    """
    Runs all four detection methods and aggregates the results into
    a single AnomalyReport. The committee dashboard consumes this.

    Per the problem statement: if ANY high-severity anomaly is detected,
    results publication is held until human review.
    """

    def __init__(
        self,
        panel:                  EvaluationPanel,
        z_score_threshold:      float = 2.0,
        divergence_threshold:   float = 3.0,
        consistency_min_std:    float = 0.5,
        halo_threshold:         float = 2.0,
        coi_bias_threshold:     float = 1.5,
    ):
        self.panel                = panel
        self.z_score_threshold    = z_score_threshold
        self.divergence_threshold = divergence_threshold
        self.consistency_min_std  = consistency_min_std
        self.halo_threshold       = halo_threshold
        self.coi_bias_threshold   = coi_bias_threshold

    def detect_all(self) -> AnomalyReport:
        anomalies: List[Anomaly] = []

        anomalies.extend(ZScoreDetector.detect(
            self.panel, self.z_score_threshold
        ))
        anomalies.extend(EuclideanDivergenceDetector.detect(
            self.panel, self.divergence_threshold
        ))
        anomalies.extend(IntraRaterConsistencyDetector.detect(
            self.panel, self.consistency_min_std, self.halo_threshold
        ))
        anomalies.extend(ConflictOfInterestDetector.detect(
            self.panel, self.coi_bias_threshold
        ))

        by_kind:     Dict[str, int] = defaultdict(int)
        by_severity: Dict[str, int] = defaultdict(int)
        for a in anomalies:
            by_kind[a.kind]         += 1
            by_severity[a.severity] += 1

        holds_release = by_severity.get("high", 0) > 0

        return AnomalyReport(
            total_anomalies       = len(anomalies),
            by_kind               = dict(by_kind),
            by_severity           = dict(by_severity),
            holds_results_release = holds_release,
            anomalies             = anomalies,
        )


# ── Helper: build panel from raw dicts (used by Celery task) ─────────

def build_panel_from_dicts(
    raw_entries: List[dict],
    criteria:    List[str],
    weights:     Optional[Dict[str, float]] = None,
) -> EvaluationPanel:
    """
    Convert raw score submissions (e.g. from the evaluator portal) into
    a typed EvaluationPanel.

    Each raw_entry should look like:
      {
        "judge_id":          "J1",
        "judge_name":        "Alice",
        "judge_institution": "MIT",
        "team_id":           "T1",
        "team_member_institutions": ["MIT", "Stanford"],
        "scores":            {"innovation": 8.5, "execution": 7.0, ...}
      }
    """
    entries = [
        ScoreEntry(
            judge_id=                 r["judge_id"],
            judge_name=               r["judge_name"],
            judge_institution=        r["judge_institution"],
            team_id=                  r["team_id"],
            team_name=                r.get("team_name", r["team_id"]),
            team_member_institutions= set(r["team_member_institutions"]),
            scores=                   r["scores"],
        )
        for r in raw_entries
    ]
    return EvaluationPanel(
        entries  = entries,
        criteria = sorted(criteria),
        weights  = weights,
    )