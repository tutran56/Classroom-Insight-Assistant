from pathlib import Path
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Classroom Behavior MVC API")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    APP_HOST: str = os.getenv("APP_HOST", "127.0.0.1")
    APP_PORT: int = int(os.getenv("APP_PORT", "8000"))

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    DATA_DIR: Path = BASE_DIR / "data"
    DEMO_OUTPUTS_DIR: Path = DATA_DIR / "demo_outputs"
    TELEGRAM_CLIPS_DIR: Path = DATA_DIR / "telegram_clips"

    GOOGLE_DRIVE_JOBS_DIR: Path = Path(
        os.getenv("GOOGLE_DRIVE_JOBS_DIR", str(DATA_DIR / "classroom_jobs"))
    )
    JOBS_INCOMING_DIR: Path = GOOGLE_DRIVE_JOBS_DIR / "incoming"
    JOBS_PROCESSING_DIR: Path = GOOGLE_DRIVE_JOBS_DIR / "processing"
    JOBS_DONE_DIR: Path = GOOGLE_DRIVE_JOBS_DIR / "done"
    JOBS_FAILED_DIR: Path = GOOGLE_DRIVE_JOBS_DIR / "failed"

    GOOGLE_DRIVE_OAUTH_CLIENT_FILE: Path = Path(
        os.getenv(
            "GOOGLE_DRIVE_OAUTH_CLIENT_FILE",
            str(BASE_DIR / "credentials" / "gdrive-oauth-client.json")
        )
    )

    GOOGLE_DRIVE_TOKEN_FILE: Path = Path(
        os.getenv(
            "GOOGLE_DRIVE_TOKEN_FILE",
            str(BASE_DIR / "credentials" / "gdrive-token.json")
        )
    )

    GOOGLE_DRIVE_INCOMING_FOLDER_ID: str = os.getenv("GOOGLE_DRIVE_INCOMING_FOLDER_ID", "")
    GOOGLE_DRIVE_PROCESSING_FOLDER_ID: str = os.getenv("GOOGLE_DRIVE_PROCESSING_FOLDER_ID", "")
    GOOGLE_DRIVE_DONE_FOLDER_ID: str = os.getenv("GOOGLE_DRIVE_DONE_FOLDER_ID", "")
    GOOGLE_DRIVE_FAILED_FOLDER_ID: str = os.getenv("GOOGLE_DRIVE_FAILED_FOLDER_ID", "")

    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
    TELEGRAM_API_BASE: str = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")


settings = Settings()