from pydantic import BaseModel


class TelegramSeedResponse(BaseModel):
    session_id: int
    class_name: str
    inserted_logs: int
    message: str