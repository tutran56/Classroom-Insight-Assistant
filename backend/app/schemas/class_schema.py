from typing import Optional
from pydantic import BaseModel


class ClassItemResponse(BaseModel):
    class_key: str
    class_name: str
    folder_path: str
    annotated_video_path: Optional[str] = None
    events_csv_path: Optional[str] = None
    segments_csv_path: Optional[str] = None
    result_json_path: Optional[str] = None
    clips_dir_path: Optional[str] = None
    annotated_video_url: Optional[str] = None
    has_annotated_video: bool = False
    has_events_csv: bool = False
    has_segments_csv: bool = False
    has_result_json: bool = False
    has_clips_dir: bool = False


class ClassListResponse(BaseModel):
    items: list[ClassItemResponse]
    total: int
