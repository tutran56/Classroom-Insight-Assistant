import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.core.config import settings
from app.repositories.behavior_repository import (
    delete_behavior_events_by_session_id,
    delete_behavior_segments_by_session_id,
    insert_behavior_events,
    insert_behavior_segments,
)
from app.repositories.session_repository import (
    create_session,
    get_session_by_key,
    update_session,
)


CLASSROOM_A_ALIASES = {
    "classroom_a",
    "classroom a",
    "a",
    "class a",
    "class_a",
    "classrooma",
}
CLASSROOM_B_ALIASES = {
    "classroom_b",
    "classroom b",
    "b",
    "class b",
    "class_b",
    "classroomb",
}
REQUIRED_IMPORT_FILES = (
    "result.json",
    "events_frame.csv",
    "phone_segments.csv",
)


def _bool_value(v: Any) -> bool:
    if pd.isna(v):
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(int(v))
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "yes", "y"}
    return False


def _float_or_none(v: Any) -> Optional[float]:
    if pd.isna(v):
        return None
    try:
        return float(v)
    except Exception:
        return None


def _int_or_none(v: Any) -> Optional[int]:
    if pd.isna(v):
        return None
    try:
        return int(float(v))
    except Exception:
        return None


def _text_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _normalize_session_key(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip().replace("\\", "/")
    if not text:
        return None

    text = Path(text).name.strip()
    return text or None


def _load_json_file(file_path: Path) -> dict:
    if not file_path.exists() or not file_path.is_file():
        return {}

    try:
        raw = file_path.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"[WARN] Failed to read JSON file {file_path}: {e}")
        return {}

    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except Exception as e:
        print(f"[WARN] Failed to parse JSON file {file_path}: {e}")
        return {}

    return parsed if isinstance(parsed, dict) else {}


def _load_result_json(session_dir: Path) -> dict:
    return _load_json_file(session_dir / "result.json")


def _load_job_json(session_dir: Path) -> dict:
    return _load_json_file(session_dir / "job.json")


def _has_required_import_files(session_dir: Path) -> bool:
    return all((session_dir / file_name).exists() for file_name in REQUIRED_IMPORT_FILES)


def _has_valid_result_json(result_json: dict) -> bool:
    if not isinstance(result_json, dict) or not result_json:
        return False

    summary = result_json.get("summary")
    return isinstance(summary, dict) and bool(summary)


def _extract_class_key_from_value(value: Any) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None

    normalized = text.replace("-", "_")
    normalized = " ".join(normalized.split())

    if normalized in CLASSROOM_A_ALIASES:
        return "classroom_a"
    if normalized in CLASSROOM_B_ALIASES:
        return "classroom_b"

    compact = normalized.replace(" ", "_")

    if (
        "classroom_a" in compact
        or compact.startswith("classroom_a_")
        or compact.startswith("classrooma_")
        or compact == "classrooma"
    ):
        return "classroom_a"

    if (
        "classroom_b" in compact
        or compact.startswith("classroom_b_")
        or compact.startswith("classroomb_")
        or compact == "classroomb"
    ):
        return "classroom_b"

    return None


def _extract_class_key_from_sources(
    session_key: Optional[str],
    result_json: Optional[dict],
    job_json: Optional[dict],
) -> str:
    candidate_values = [
        session_key,
        (job_json or {}).get("class_id"),
        (job_json or {}).get("class_key"),
        (job_json or {}).get("class_name"),
        (job_json or {}).get("session_id"),
        (job_json or {}).get("session_key"),
        (job_json or {}).get("job_id"),
        (result_json or {}).get("class_id"),
        (result_json or {}).get("class_key"),
        (result_json or {}).get("class_name"),
        (result_json or {}).get("session_id"),
        (result_json or {}).get("session_key"),
        (result_json or {}).get("job_id"),
        ((result_json or {}).get("summary") or {}).get("session_id"),
        ((result_json or {}).get("summary") or {}).get("job_id"),
    ]

    for candidate in candidate_values:
        class_key = _extract_class_key_from_value(candidate)
        if class_key:
            return class_key

    return "unknown"


def _class_display_name(class_key: str) -> str:
    if class_key == "classroom_a":
        return "Classroom A"
    if class_key == "classroom_b":
        return "Classroom B"
    return "Unknown"


def _resolve_session_key(session_dir_name: str, result_json: dict, job_json: dict) -> str:
    candidates = [
        result_json.get("session_id"),
        result_json.get("session_key"),
        result_json.get("job_id"),
        (result_json.get("summary") or {}).get("session_id"),
        (result_json.get("summary") or {}).get("job_id"),
        job_json.get("session_id"),
        job_json.get("session_key"),
        job_json.get("job_id"),
        session_dir_name,
    ]

    for candidate in candidates:
        normalized = _normalize_session_key(candidate)
        if normalized:
            return normalized

    return session_dir_name


def _build_static_path(session_key: str, file_name: str) -> Optional[str]:
    file_path = settings.DEMO_OUTPUTS_DIR / session_key / file_name
    if not file_path.exists():
        return None
    return f"/static/demo_outputs/{session_key}/{file_name}"


def _build_clip_static_path(session_key: str, clip_filename: Optional[str]) -> Optional[str]:
    if not clip_filename:
        return None

    file_path = settings.DEMO_OUTPUTS_DIR / session_key / "clips" / clip_filename
    if not file_path.exists():
        return None

    return f"/static/demo_outputs/{session_key}/clips/{clip_filename}"


def _resolve_video_name(result_json: dict, job_json: dict) -> Optional[str]:
    candidates = [
        result_json.get("video_name"),
        (result_json.get("summary") or {}).get("video_name"),
        job_json.get("input_video"),
        job_json.get("video_name"),
    ]

    for candidate in candidates:
        text = _text_or_none(candidate)
        if text:
            return text

    return None


def _resolve_created_at(result_json: dict, job_json: dict) -> str:
    candidates = [
        job_json.get("created_at"),
        result_json.get("created_at"),
        (result_json.get("summary") or {}).get("created_at"),
    ]

    for candidate in candidates:
        text = _text_or_none(candidate)
        if text:
            return text

    return datetime.now().isoformat(timespec="seconds")


def _build_session_payload(session_key: str, result_json: dict, job_json: dict) -> dict:
    class_key = _extract_class_key_from_sources(
        session_key=session_key,
        result_json=result_json,
        job_json=job_json,
    )
    class_name = _class_display_name(class_key)

    payload = {
        "class_name": class_name,
        "session_key": session_key,
        "video_name": _resolve_video_name(result_json, job_json),
        "annotated_video_path": _build_static_path(session_key, "annotated_video.mp4"),
        "events_csv_path": _build_static_path(session_key, "events_frame.csv"),
        "segments_csv_path": _build_static_path(session_key, "phone_segments.csv"),
        "result_json_path": _build_static_path(session_key, "result.json"),
        "created_at": _resolve_created_at(result_json, job_json),
    }

    return {key: value for key, value in payload.items() if value is not None}


def _ensure_session(session_key: str, result_json: dict, job_json: dict) -> dict:
    payload = _build_session_payload(session_key, result_json, job_json)

    existing = get_session_by_key(session_key)
    if existing:
        updated = update_session(existing["id"], payload)
        return updated if updated else existing

    created = create_session(payload)
    if not created:
        raise ValueError("Không tạo được session trong Supabase")

    return created


def _read_csv(session_dir: Path, file_name: str) -> pd.DataFrame:
    csv_path = session_dir / file_name
    if not csv_path.exists():
        return pd.DataFrame()

    try:
        return pd.read_csv(csv_path)
    except Exception as e:
        print(f"[WARN] Failed reading CSV {csv_path}: {e}")
        return pd.DataFrame()


def _pick_column(row: pd.Series, *names: str) -> Any:
    for name in names:
        if name in row.index:
            return row.get(name)
    return None


def _load_events_rows(session_id: int, session_dir: Path) -> list[dict]:
    df = _read_csv(session_dir, "events_frame.csv")
    if df.empty:
        return []

    rows: list[dict] = []

    for _, row in df.iterrows():
        frame_value = _pick_column(row, "frame", "frame_idx", "frame_id")
        time_sec_value = _pick_column(row, "time_sec", "timestamp_sec")
        target_id_value = _pick_column(row, "target_id")

        frame = _int_or_none(frame_value)
        time_sec = _float_or_none(time_sec_value)
        target_id = _int_or_none(target_id_value)
        label = _text_or_none(_pick_column(row, "label"))

        if frame is None or time_sec is None or target_id is None or not label:
            continue

        rows.append(
            {
                "session_id": session_id,
                "frame": frame,
                "time_sec": time_sec,
                "target_id": target_id,
                "x1": _float_or_none(_pick_column(row, "x1")),
                "y1": _float_or_none(_pick_column(row, "y1")),
                "x2": _float_or_none(_pick_column(row, "x2")),
                "y2": _float_or_none(_pick_column(row, "y2")),
                "label": label,
                "conf": _float_or_none(_pick_column(row, "conf", "confidence", "score")),
                "alpha": _float_or_none(_pick_column(row, "alpha")),
                "missed": _int_or_none(_pick_column(row, "missed")),
                "track_visible": _bool_value(_pick_column(row, "track_visible")),
                "is_phone": _bool_value(_pick_column(row, "is_phone")),
                "event_candidate": _bool_value(_pick_column(row, "event_candidate")),
            }
        )

    return rows


def _load_segment_rows(session_id: int, session_key: str, session_dir: Path) -> list[dict]:
    df = _read_csv(session_dir, "phone_segments.csv")
    if df.empty:
        return []

    rows: list[dict] = []

    for _, row in df.iterrows():
        segment_id = _text_or_none(_pick_column(row, "segment_id"))
        target_id = _int_or_none(_pick_column(row, "target_id"))
        label = _text_or_none(_pick_column(row, "label"))
        start_time_sec = _float_or_none(_pick_column(row, "start_time_sec", "start_sec"))
        end_time_sec = _float_or_none(_pick_column(row, "end_time_sec", "end_sec"))

        if not segment_id or target_id is None or not label or start_time_sec is None or end_time_sec is None:
            continue

        clip_filename = None
        raw_clip_path = _pick_column(row, "clip_path", "clip_file", "clip_name", "clip_filename")
        if raw_clip_path is not None and not pd.isna(raw_clip_path):
            clip_filename = Path(str(raw_clip_path)).name

        clip_path = _build_clip_static_path(session_key, clip_filename)

        rows.append(
            {
                "session_id": session_id,
                "segment_id": segment_id,
                "target_id": target_id,
                "label": label,
                "start_time_sec": start_time_sec,
                "end_time_sec": end_time_sec,
                "duration_sec": _float_or_none(_pick_column(row, "duration_sec")),
                "peak_conf": _float_or_none(_pick_column(row, "peak_conf")),
                "mean_conf": _float_or_none(_pick_column(row, "mean_conf", "avg_conf")),
                "clip_start_sec": _float_or_none(_pick_column(row, "clip_start_sec")),
                "clip_end_sec": _float_or_none(_pick_column(row, "clip_end_sec")),
                "clip_path": clip_path,
                "telegram_ready": _bool_value(_pick_column(row, "telegram_ready")),
                "telegram_sent": False,
                "telegram_sent_at": None,
            }
        )

    return rows


def import_class_output_to_supabase(session_key: str) -> dict | None:
    normalized_session_key = _normalize_session_key(session_key)
    if not normalized_session_key:
        return None

    session_dir = settings.DEMO_OUTPUTS_DIR / normalized_session_key
    if not session_dir.exists() or not session_dir.is_dir():
        return None

    if not _has_required_import_files(session_dir):
        print(f"[WARN] Missing required import files in {session_dir}")
        return None

    result_json = _load_result_json(session_dir)
    if not _has_valid_result_json(result_json):
        print(f"[WARN] Invalid or incomplete result.json in {session_dir}")
        return None

    job_json = _load_job_json(session_dir)

    resolved_session_key = _resolve_session_key(
        session_dir_name=normalized_session_key,
        result_json=result_json,
        job_json=job_json,
    )

    if resolved_session_key != normalized_session_key:
        print(
            f"[WARN] Session key mismatch during import: resolved={resolved_session_key}, "
            f"using_dir={normalized_session_key}"
        )
        resolved_session_key = normalized_session_key

    session = _ensure_session(resolved_session_key, result_json, job_json)

    session_id = int(session["id"])
    final_session_key = str(session["session_key"])
    class_name = str(session.get("class_name") or "Unknown")
    class_key = _extract_class_key_from_sources(
        session_key=final_session_key,
        result_json=result_json,
        job_json=job_json,
    )

    delete_behavior_events_by_session_id(session_id)
    delete_behavior_segments_by_session_id(session_id)

    event_rows = _load_events_rows(session_id, session_dir)
    segment_rows = _load_segment_rows(session_id, final_session_key, session_dir)

    inserted_events = insert_behavior_events(event_rows) if event_rows else 0
    inserted_segments = insert_behavior_segments(segment_rows) if segment_rows else 0

    return {
        "session_key": final_session_key,
        "session_id": session_id,
        "class_key": class_key,
        "class_name": class_name,
        "inserted_events": inserted_events,
        "inserted_segments": inserted_segments,
        "message": "Import completed successfully",
    }