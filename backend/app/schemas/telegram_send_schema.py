from typing import Optional

from pydantic import BaseModel, Field


class TelegramSendWindowRequest(BaseModel):
    window_start_sec: float = Field(..., ge=0)
    window_end_sec: float = Field(..., gt=0)
    reason: Optional[str] = None
    class_name: Optional[str] = None
    use_existing_phone_clip_first: bool = True


class TelegramSendWindowResponse(BaseModel):
    session_id: int
    session_key: str
    class_name: str
    window_start_sec: float
    window_end_sec: float
    clip_path: Optional[str] = None
    telegram_status: str
    message: str
    sent_at: Optional[str] = None