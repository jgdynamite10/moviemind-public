"""Schemas for the app."""
from pydantic import BaseModel, validator

class WSMessage(BaseModel):
    """
    Websocket Message schema.

    Attributes:
        sender (str): The sender of the message.
        message (str): The content of the message.
        type (str): The type of the message.

    Validators:
        sender_must_be_bot_or_you: Validates that the sender is either "bot" or "you".
        validate_message_type: Validates that the message type is one of the allowed types.
    """

    sender: str
    message: str
    type: str

    @validator("sender")
    def sender_must_be_bot_or_you(cls, v):
        if v not in ["bot", "you"]:
            raise ValueError("sender must be bot or you")
        return v

    @validator("type")
    def validate_message_type(cls, v):
        if v not in ["question", "start", "restart", "stream", "end", "error", "info", "progress", "progress-end", "system", "done"]:
            raise ValueError("Message type mismatch.")
        return v
