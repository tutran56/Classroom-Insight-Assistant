from typing import Optional
from pydantic import BaseModel


class AICommentaryResponse(BaseModel):
    session_id: int
    class_name: str
    overall_sentiment: str
    summary_text: str
    highlights: list[str]
    suggestion: str
    input_stats: dict
    fallback_reason: Optional[str] = None
