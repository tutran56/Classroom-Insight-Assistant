import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import settings


def _get_class_dir(class_key: str) -> Path:
    return settings.DEMO_OUTPUTS_DIR / class_key


def _safe_read_json(file_path: Path) -> dict[str, Any] | None:
    if not file_path.exists():
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _safe_read_csv_preview(file_path: Path, limit: int = 10) -> list[dict[str, Any]] | None:
    if not file_path.exists():
        return None

    df = pd.read_csv(file_path)
    if df.empty:
        return []

    preview_df = df.head(limit).copy()
    preview_df = preview_df.where(pd.notna(preview_df), None)

    return preview_df.to_dict(orient="records")


def get_output_preview(class_key: str, limit: int = 10) -> dict[str, Any] | None:
    class_dir = _get_class_dir(class_key)
    if not class_dir.exists() or not class_dir.is_dir():
        return None

    result_json_path = class_dir / "result.json"
    events_csv_path = class_dir / "events_frame.csv"
    segments_csv_path = class_dir / "phone_segments.csv"

    result_json = _safe_read_json(result_json_path)
    events_preview = _safe_read_csv_preview(events_csv_path, limit=limit)
    segments_preview = _safe_read_csv_preview(segments_csv_path, limit=limit)

    return {
        "class_key": class_key,
        "result_json_exists": result_json_path.exists(),
        "events_csv_exists": events_csv_path.exists(),
        "segments_csv_exists": segments_csv_path.exists(),
        "result_json": result_json,
        "events_preview": events_preview,
        "segments_preview": segments_preview,
    }
