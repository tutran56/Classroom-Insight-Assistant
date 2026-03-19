from typing import Any
from pydantic import BaseModel


class OutputPreviewResponse(BaseModel):
    class_key: str
    result_json_exists: bool
    events_csv_exists: bool
    segments_csv_exists: bool
    result_json: dict[str, Any] | None = None
    events_preview: list[dict[str, Any]] | None = None
    segments_preview: list[dict[str, Any]] | None = None
