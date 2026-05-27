import numpy as np
from app.services.csp_solver import ObjectiveFunction, ParticipantNode

def test_compute_target_averages():
    participants = [
        ParticipantNode(id="1", name="A", institution="X", skill_vector={"python": 8.0, "ml": 6.0}),
        ParticipantNode(id="2", name="B", institution="Y", skill_vector={"python": 4.0, "ml": 4.0}),
        ParticipantNode(id="3", name="C", institution="Z", skill_vector={"python": 6.0, "ml": 8.0}),
    ]
    # Mean of python: (8+4+6)/3 = 6.0
    # Mean of ml: (6+4+8)/3 = 6.0
    
    target_avgs = ObjectiveFunction.compute_target_averages(
        participants=participants,
        num_teams=1,
        target_size=3
    )
    
    np.testing.assert_allclose(target_avgs, [6.0, 6.0])

def test_compute_target_averages_empty():
    target_avgs = ObjectiveFunction.compute_target_averages(
        participants=[],
        num_teams=1,
        target_size=3
    )
    
    assert len(target_avgs) == 0
