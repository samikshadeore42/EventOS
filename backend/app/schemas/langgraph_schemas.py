# File: backend/app/schemas/langgraph_schemas.py
#
# Pydantic schemas for the LangGraph event configuration agent.
#
# Request/response contracts for POST /ai/configure-event

from typing import Optional, List
from pydantic import BaseModel, Field


class ConfigureEventRequest(BaseModel):
    """
    One turn in the configuration conversation.
    Frontend sends this on every chat message.
    """
    message:    str = Field(
        ...,
        description="The committee member's latest message.",
        examples=["We are running a 3-round hackathon for 200 participants."]
    )
    session_id: str = Field(
        ...,
        description=(
            "Stable session identifier for this conversation. "
            "Frontend generates this once on page load using crypto.randomUUID() "
            "and reuses it for every message in the same chat."
        ),
        examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
    )


class EventConfig(BaseModel):
    """
    The structured event configuration produced when is_complete=True.
    Matches the shape the backend uses to create the event.
    """
    event_name:      str         = Field(..., examples=["WiSE@TI Hackathon 2025"])
    rounds:          int         = Field(..., ge=1, examples=[3])
    stages:          List[str]   = Field(..., examples=[["registration", "team_formation", "evaluation", "results"]])
    team_size:       int         = Field(..., ge=2, examples=[3])
    scoring_weights: List[float] = Field(..., examples=[[0.30, 0.30, 0.40]])
    elimination:     bool        = Field(..., examples=[True])
    approval_gates:  List[str]   = Field(..., examples=[["after_team_formation", "after_each_round"]])
    event_type: str = Field(default="generic_competitive_event", examples=["hackathon"])


class ConfigureEventResponse(BaseModel):
    """
    Agent response for one conversation turn.
    Frontend reads reply to display in chat, checks is_complete to
    know when to show the config summary card.
    """
    reply:       str                   = Field(
        ...,
        description="The agent's response — either a clarifying question or a confirmation message."
    )
    is_complete: bool                  = Field(
        ...,
        description="True when the agent has collected all required fields and config is ready."
    )
    config:      Optional[EventConfig] = Field(
        None,
        description="The structured event config. Only set when is_complete=True."
    )


class CreateFromConfigResponse(BaseModel):
    """
    Response returned after POST /events/create-from-config
    saves the agent config to the database.
    """
    event_id:   str = Field(..., description="UUID of the newly created event.")
    event_name: str = Field(..., description="Name of the created event.")
    status:     str = Field(..., description="Always 'created' on success.")
    message:    str = Field(..., description="Human-readable confirmation message.")