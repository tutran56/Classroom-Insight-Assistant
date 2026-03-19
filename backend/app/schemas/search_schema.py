from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PromptSearchRequest(BaseModel):
    query: str


class PromptMatch(BaseModel):
    type: Optional[str] = None
    label: Optional[str] = None
    target_id: Optional[int] = None
    time_sec: Optional[float] = None
    frame: Optional[int] = None
    conf: Optional[float] = None
    alpha: Optional[float] = None
    start_time_sec: Optional[float] = None
    end_time_sec: Optional[float] = None
    duration_sec: Optional[float] = None
    clip_path: Optional[str] = None
    telegram_ready: Optional[bool] = None


class PromptSearchResponse(BaseModel):
    query_type: str
    answer: str
    seek_time_sec: Optional[float] = None
    window_start_sec: Optional[float] = None
    window_end_sec: Optional[float] = None

    session_id: Optional[int] = None
    session_key: Optional[str] = None
    class_name: Optional[str] = None

    prompt: Optional[str] = None
    behavior: Optional[str] = None
    target_id: Optional[int] = None
    count: Optional[int] = None
    score: Optional[float] = None

    recommended_clip_path: Optional[str] = None
    recommended_segment: Optional[PromptMatch] = None
    breakdown: Optional[Dict[str, int]] = None
    matches: List[PromptMatch] = []