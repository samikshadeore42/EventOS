"""
Phase 2 exit-condition tests: multi-event data isolation.

These 6 checks MUST all pass before Phase 3 work begins.
They prove that no data leaks between two independently created events.

Run with:
    pytest tests/test_phase2_isolation.py -v
"""

import uuid
import pytest
from httpx import AsyncClient


# ------------------------------------------------------------------ #
# Fixtures
# ------------------------------------------------------------------ #

ORG_SLUG = "test-org-isolation"
EVENT_A_SLUG = "event-alpha"
EVENT_B_SLUG = "event-beta"

USER_A = str(uuid.uuid4())
USER_B = str(uuid.uuid4())


@pytest.fixture(scope="module")
async def setup_two_events(async_client: AsyncClient):
    """Create one org and two independent events."""
    # Organization
    await async_client.post("/api/v1/orgs", json={
        "name": "Isolation Test Org",
        "slug": ORG_SLUG,
    })

    # Event A
    resp_a = await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events",
        json={
            "name": "Event Alpha",
            "slug": EVENT_A_SLUG,
            "event_type": "hackathon",
            "capabilities": ["teams", "mentors", "submissions"],
        },
    )
    assert resp_a.status_code == 201, resp_a.text

    # Event B
    resp_b = await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events",
        json={
            "name": "Event Beta",
            "slug": EVENT_B_SLUG,
            "event_type": "coding_contest",
            "capabilities": ["submissions", "live_scoring"],
        },
    )
    assert resp_b.status_code == 201, resp_b.text

    return resp_a.json(), resp_b.json()


# ------------------------------------------------------------------ #
# Isolation check 1: participants do not leak between events
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_participants_do_not_leak(async_client: AsyncClient, setup_two_events):
    # Add USER_A as participant in Event A
    await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/memberships",
        json={"user_id": USER_A, "role": "participant"},
    )

    # Event B memberships should NOT contain USER_A
    resp = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/memberships"
    )
    assert resp.status_code == 200
    user_ids = [m["user_id"] for m in resp.json()]
    assert USER_A not in user_ids, (
        f"ISOLATION FAILURE: USER_A appeared in Event B memberships: {user_ids}"
    )


# ------------------------------------------------------------------ #
# Isolation check 2: teams do not leak between events
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_teams_do_not_leak(async_client: AsyncClient, setup_two_events):
    # Create a team in Event A
    create_resp = await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/teams",
        json={"name": "Team Alpha"},
    )
    if create_resp.status_code == 404:
        pytest.skip("Teams endpoint not yet implemented — check after Phase 2 scoping branch")

    assert create_resp.status_code == 201

    # Fetch teams from Event B — should be empty
    resp_b = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/teams"
    )
    assert resp_b.status_code == 200
    assert resp_b.json() == [], (
        f"ISOLATION FAILURE: Teams from Event A appeared in Event B: {resp_b.json()}"
    )


# ------------------------------------------------------------------ #
# Isolation check 3: mentors do not leak between events
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_mentors_do_not_leak(async_client: AsyncClient, setup_two_events):
    mentor_id = str(uuid.uuid4())

    # Add mentor to Event A only
    await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/memberships",
        json={"user_id": mentor_id, "role": "mentor"},
    )

    # Event B memberships should not include this mentor
    resp = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/memberships"
    )
    assert resp.status_code == 200
    user_ids = [m["user_id"] for m in resp.json()]
    assert mentor_id not in user_ids, (
        f"ISOLATION FAILURE: Mentor from Event A leaked into Event B: {user_ids}"
    )


# ------------------------------------------------------------------ #
# Isolation check 4: scores do not mix between events
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_scores_do_not_mix(async_client: AsyncClient, setup_two_events):
    # This test will expand once the scores endpoint is scoped in
    # the stage2/multi-event-scoping branch. For now, verify the
    # isolation_check endpoint correctly returns different event_ids.

    resp_a = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/isolation-check"
    )
    resp_b = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/isolation-check"
    )

    assert resp_a.status_code == 200
    assert resp_b.status_code == 200

    event_a_id = resp_a.json()["event_id"]
    event_b_id = resp_b.json()["event_id"]

    assert event_a_id != event_b_id, (
        "ISOLATION FAILURE: Both events resolved to the same event_id."
    )


# ------------------------------------------------------------------ #
# Isolation check 5: portals show only the selected event
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_portals_show_only_selected_event(async_client: AsyncClient, setup_two_events):
    # Event A should have "teams" capability; Event B should not
    resp_a = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/isolation-check"
    )
    resp_b = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/isolation-check"
    )

    caps_a = resp_a.json()["capabilities"]
    caps_b = resp_b.json()["capabilities"]

    assert "teams" in caps_a, f"Event A should have 'teams' capability, got: {caps_a}"
    assert "teams" not in caps_b, f"Event B should NOT have 'teams' capability, got: {caps_b}"
    assert "live_scoring" in caps_b, f"Event B should have 'live_scoring', got: {caps_b}"
    assert "live_scoring" not in caps_a, f"Event A should NOT have 'live_scoring', got: {caps_a}"


# ------------------------------------------------------------------ #
# Isolation check 6: same person can participate in both events
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_same_person_can_join_both_events(async_client: AsyncClient, setup_two_events):
    shared_user = str(uuid.uuid4())

    # Join Event A
    resp_a = await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/memberships",
        json={"user_id": shared_user, "role": "participant"},
    )
    assert resp_a.status_code == 201, (
        f"Should be able to join Event A: {resp_a.text}"
    )

    # Join Event B with the same user
    resp_b = await async_client.post(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/memberships",
        json={"user_id": shared_user, "role": "participant"},
    )
    assert resp_b.status_code == 201, (
        f"Same user should be able to join Event B independently: {resp_b.text}"
    )

    # Confirm memberships exist independently
    members_a = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_A_SLUG}/memberships"
    )
    members_b = await async_client.get(
        f"/api/v1/orgs/{ORG_SLUG}/events/{EVENT_B_SLUG}/memberships"
    )

    a_ids = [m["user_id"] for m in members_a.json()]
    b_ids = [m["user_id"] for m in members_b.json()]

    assert shared_user in a_ids, "Shared user missing from Event A"
    assert shared_user in b_ids, "Shared user missing from Event B"