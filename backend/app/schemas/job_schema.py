from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class JobCreateResponse(BaseModel):
    job_id: str
    session_key: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    session_key: str
    status: str
    progress: int = 0
    message: str = ""
    updated_at: Optional[str] = None
    result_ready: bool = False
    imported: bool = False
    session_id: Optional[int] = None


class JobSummaryResponse(BaseModel):
    session_id: Optional[str] = None
    job_id: Optional[str] = None
    video_name: Optional[str] = None
    video_duration_sec: Optional[float] = None
    num_targets_locked: int = 0
    num_frame_events: int = 0
    num_phone_rows: int = 0
    num_phone_segments: int = 0
    num_phone_clips_ready: int = 0


class JobAssetsResponse(BaseModel):
    annotated_video_path: Optional[str] = None
    annotated_video_url: Optional[str] = None
    events_frame_csv_path: Optional[str] = None
    events_frame_csv_url: Optional[str] = None
    phone_segments_csv_path: Optional[str] = None
    phone_segments_csv_url: Optional[str] = None
    clips_dir: Optional[str] = None
    clips_base_url: Optional[str] = None


class JobPhoneSegmentResponse(BaseModel):
    target_id: Optional[int] = None
    label: Optional[str] = None
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    duration_sec: Optional[float] = None
    peak_conf: Optional[float] = None
    avg_conf: Optional[float] = None
    clip_file: Optional[str] = None
    clip_path: Optional[str] = None
    clip_url: Optional[str] = None


class JobClipItemResponse(BaseModel):
    target_id: Optional[int] = None
    label: Optional[str] = None
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    duration_sec: Optional[float] = None
    clip_file: Optional[str] = None
    clip_path: Optional[str] = None
    clip_url: Optional[str] = None


class JobEventPreviewResponse(BaseModel):
    frame_idx: Optional[int] = None
    time_sec: Optional[float] = None
    target_id: Optional[int] = None
    label: Optional[str] = None
    confidence: Optional[float] = None


class JobResultResponse(BaseModel):
    job_id: str
    session_key: str
    status: str
    session_id: Optional[int] = None

    summary: Optional[JobSummaryResponse] = None
    label_distribution: Dict[str, int] = Field(default_factory=dict)
    assets: Optional[JobAssetsResponse] = None

    phone_segments: List[JobPhoneSegmentResponse] = Field(default_factory=list)
    clips: List[JobClipItemResponse] = Field(default_factory=list)
    events_preview: List[JobEventPreviewResponse] = Field(default_factory=list)

    result_json: Optional[Dict[str, Any]] = None
