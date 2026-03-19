from typing import List, Optional

from pydantic import BaseModel, Field


class SessionResponse(BaseModel):
    id: int
    class_name: str
    class_key: Optional[str] = None
    session_key: str

    video_name: Optional[str] = None

    annotated_video_path: Optional[str] = None
    annotated_video_url: Optional[str] = None

    events_csv_path: Optional[str] = None
    segments_csv_path: Optional[str] = None
    result_json_path: Optional[str] = None

    created_at: Optional[str] = None
    imported_at: Optional[str] = None

    overall_sentiment: Optional[str] = None
    summary_text: Optional[str] = None


class SessionListResponse(BaseModel):
    items: List[SessionResponse] = Field(default_factory=list)
    total: int = 0


class BehaviorDistributionItem(BaseModel):
    label: str
    count: int


class BehaviorDistributionResponse(BaseModel):
    session_id: int
    class_name: str
    total_events: int
    positive_count: int
    negative_count: int
    positive_ratio: float
    negative_ratio: float
    items: List[BehaviorDistributionItem] = Field(default_factory=list)


class BehaviorSegmentItem(BaseModel):
    id: Optional[int] = None
    session_id: int
    segment_id: str
    target_id: int
    label: str

    start_time_sec: float
    end_time_sec: float

    duration_sec: Optional[float] = None
    peak_conf: Optional[float] = None
    mean_conf: Optional[float] = None

    clip_start_sec: Optional[float] = None
    clip_end_sec: Optional[float] = None

    clip_path: Optional[str] = None
    clip_url: Optional[str] = None

    telegram_ready: bool = False
    telegram_sent: bool = False
    telegram_sent_at: Optional[str] = None


class BehaviorSegmentListResponse(BaseModel):
    session_id: int
    class_name: str
    items: List[BehaviorSegmentItem] = Field(default_factory=list)
    total: int = 0


class TelegramLogItem(BaseModel):
    id: int
    session_id: int

    segment_id: Optional[str] = None
    target_id: Optional[int] = None
    label: Optional[str] = None

    clip_path: Optional[str] = None
    clip_url: Optional[str] = None

    status: Optional[str] = None
    message: Optional[str] = None
    sent_at: Optional[str] = None


class TelegramLogListResponse(BaseModel):
    session_id: int
    class_name: str
    items: List[TelegramLogItem] = Field(default_factory=list)
    total: int = 0


class TopPhoneWindowResponse(BaseModel):
    session_id: int
    class_name: str
    window_sec: int
    window_start_sec: float
    window_end_sec: float
    distinct_target_count: int
    event_count: int
    target_ids: List[int] = Field(default_factory=list)
    label: str


class NegativeBreakdown(BaseModel):
    using_phone: int = 0
    sleeping: int = 0
    turning: int = 0


class TopNegativeWindowResponse(BaseModel):
    session_id: int
    class_name: str
    window_sec: int
    window_start_sec: float
    window_end_sec: float
    negative_score: int
    breakdown: NegativeBreakdown
