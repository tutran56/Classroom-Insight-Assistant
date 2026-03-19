from pydantic import BaseModel


class ImportResultResponse(BaseModel):
    class_key: str
    session_id: int
    session_key: str
    class_name: str
    inserted_events: int
    inserted_segments: int
    message: str
