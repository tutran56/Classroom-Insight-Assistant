from collections import Counter, defaultdict
import math
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.repositories.analytics_repository import (
    list_sessions,
    get_session_by_id,
    get_behavior_events_by_session_id,
    get_behavior_event_rows_for_windows,
    get_behavior_segments_by_session_id,
    get_telegram_logs_by_session_id,
    insert_telegram_logs,
)


POSITIVE_LABELS = {"writing", "reading", "raising_hand"}
NEGATIVE_LABELS = {"using_phone", "sleeping", "turning"}
NEGATIVE_WEIGHTS = {
    "using_phone": 3,
    "sleeping": 3,
    "turning": 1,
}


def _normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _normalize_session_key(value: Optional[str]) -> str:
    text = _normalize_text(value)
    if not text:
        return ""

    text = text.replace("\\", "/")
    text = text.split("/")[-1]
    return text.strip()


def _normalize_class_key_from_value(value: Optional[str]) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None

    compact = text.replace("-", "_")
    compact = " ".join(compact.split())

    if compact in {"classroom_a", "classroom a", "a", "class a", "class_a"}:
        return "classroom_a"

    if compact in {"classroom_b", "classroom b", "b", "class b", "class_b"}:
        return "classroom_b"

    compact_underscore = compact.replace(" ", "_")

    if (
        "classroom_a" in compact_underscore
        or compact_underscore.startswith("classroom_a_")
        or compact_underscore.startswith("classrooma_")
        or compact_underscore == "classrooma"
    ):
        return "classroom_a"

    if (
        "classroom_b" in compact_underscore
        or compact_underscore.startswith("classroom_b_")
        or compact_underscore.startswith("classroomb_")
        or compact_underscore == "classroomb"
    ):
        return "classroom_b"

    return None


def _normalize_class_key(
    class_name: Optional[str],
    session_key: Optional[str],
    video_name: Optional[str] = None,
) -> str:
    for candidate in [class_name, session_key, video_name]:
        class_key = _normalize_class_key_from_value(candidate)
        if class_key:
            return class_key
    return "unknown"


def _class_display_name(class_key: str) -> str:
    if class_key == "classroom_a":
        return "Classroom A"

    if class_key == "classroom_b":
        return "Classroom B"

    return "Unknown"


def _safe_dt(value: Optional[str]):
    if not value:
        return datetime.min

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.min


def _demo_rel_path(session_key: str, file_name: str) -> str:
    normalized_session_key = _normalize_session_key(session_key)
    safe_name = Path(str(file_name)).name
    return f"demo_outputs/{normalized_session_key}/{safe_name}"


def _demo_clip_rel_path(session_key: str, file_name: str) -> str:
    normalized_session_key = _normalize_session_key(session_key)
    safe_name = Path(str(file_name)).name
    return f"demo_outputs/{normalized_session_key}/clips/{safe_name}"


def _normalize_static_url(path_value: Optional[str]) -> Optional[str]:
    if not path_value:
        return None

    path = str(path_value).strip().replace("\\", "/")
    if not path:
        return None

    if path.startswith("/static/"):
        return path

    if path.startswith("static/"):
        return f"/{path}"

    return f"/static/{path.lstrip('/')}"


def _resolve_demo_output_path_from_any(raw_path: Optional[str]) -> Optional[Path]:
    if not raw_path:
        return None

    text = str(raw_path).strip()
    if not text:
        return None

    direct = Path(text)
    if direct.exists() and direct.is_file():
        return direct

    prefixes = [
        "/static/demo_outputs/",
        "static/demo_outputs/",
        "demo_outputs/",
    ]
    for prefix in prefixes:
        if text.startswith(prefix):
            relative = text.replace(prefix, "", 1)
            candidate = settings.DEMO_OUTPUTS_DIR / relative
            if candidate.exists() and candidate.is_file():
                return candidate

    return None


def _resolve_session_output_dir(session_key: Optional[str]) -> Optional[Path]:
    normalized_session_key = _normalize_session_key(session_key)
    if not normalized_session_key:
        return None

    candidate = settings.DEMO_OUTPUTS_DIR / normalized_session_key
    if candidate.exists() and candidate.is_dir():
        return candidate

    return None


def _resolve_local_annotated_video(session: Dict[str, Any]) -> Optional[Path]:
    session_key = _normalize_session_key(session.get("session_key"))
    if session_key:
        candidate = settings.DEMO_OUTPUTS_DIR / session_key / "annotated_video.mp4"
        if candidate.exists() and candidate.is_file():
            return candidate

    raw_path = session.get("annotated_video_path")
    candidate_from_path = _resolve_demo_output_path_from_any(raw_path)
    if candidate_from_path:
        return candidate_from_path

    return None


def _build_annotated_rel_path(
    session_key: Optional[str],
    annotated_video_path: Optional[str],
) -> Optional[str]:
    normalized_session_key = _normalize_session_key(session_key)
    if not normalized_session_key:
        return None

    candidate = settings.DEMO_OUTPUTS_DIR / normalized_session_key / "annotated_video.mp4"
    if candidate.exists() and candidate.is_file():
        return _demo_rel_path(normalized_session_key, "annotated_video.mp4")

    resolved = _resolve_demo_output_path_from_any(annotated_video_path)
    if resolved and resolved.exists() and resolved.is_file():
        return _demo_rel_path(normalized_session_key, resolved.name)

    raw = str(annotated_video_path or "").strip().replace("\\", "/")
    if raw.startswith("/static/demo_outputs/"):
        return raw.replace("/static/", "", 1)
    if raw.startswith("static/demo_outputs/"):
        return raw.replace("static/", "", 1)
    if raw.startswith("demo_outputs/"):
        return raw

    return None


def _has_displayable_assets(session_key: Optional[str], annotated_video_path: Optional[str]) -> bool:
    session_dir = _resolve_session_output_dir(session_key)
    if session_dir is None:
        return False

    annotated_video = session_dir / "annotated_video.mp4"
    if not annotated_video.exists() or not annotated_video.is_file():
        return False

    result_json = session_dir / "result.json"
    if not result_json.exists() or not result_json.is_file():
        return False

    if annotated_video.stat().st_size <= 0:
        return False

    rel_path = _build_annotated_rel_path(session_key=session_key, annotated_video_path=annotated_video_path)
    if rel_path is None:
        return False

    return True


def _normalize_session_item(row: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(row or {})

    session_key = _normalize_session_key(item.get("session_key"))
    raw_class_name = str(item.get("class_name") or "").strip()
    video_name = item.get("video_name")

    class_key = _normalize_class_key(
        class_name=raw_class_name,
        session_key=session_key,
        video_name=video_name,
    )
    class_name = _class_display_name(class_key)

    annotated_video_path = item.get("annotated_video_path")
    normalized_video_rel_path = _build_annotated_rel_path(
        session_key=session_key,
        annotated_video_path=annotated_video_path,
    )

    return {
        "id": item.get("id"),
        "class_name": class_name,
        "class_key": class_key,
        "session_key": session_key,
        "video_name": video_name,
        "annotated_video_path": normalized_video_rel_path,
        "annotated_video_url": _normalize_static_url(normalized_video_rel_path),
        "events_csv_path": item.get("events_csv_path"),
        "segments_csv_path": item.get("segments_csv_path"),
        "result_json_path": item.get("result_json_path"),
        "created_at": item.get("created_at"),
        "imported_at": item.get("imported_at"),
        "overall_sentiment": item.get("overall_sentiment"),
        "summary_text": item.get("summary_text"),
        "has_displayable_assets": _has_displayable_assets(
            session_key=session_key,
            annotated_video_path=annotated_video_path,
        ),
    }


def _is_usable_session(item: Dict[str, Any]) -> bool:
    if not item.get("id"):
        return False

    if not item.get("session_key"):
        return False

    if item.get("class_key") not in {"classroom_a", "classroom_b"}:
        return False

    if not bool(item.get("has_displayable_assets")):
        return False

    return True


def _dedupe_sessions(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    best_by_session_key: Dict[str, Dict[str, Any]] = {}

    def sort_key(x: Dict[str, Any]):
        return (
            int(bool(x.get("has_displayable_assets"))),
            _safe_dt(x.get("created_at")),
            _safe_dt(x.get("imported_at")),
            int(x.get("id") or 0),
        )

    for item in items:
        session_key = str(item.get("session_key") or "").strip()
        if not session_key:
            continue

        existing = best_by_session_key.get(session_key)
        if existing is None or sort_key(item) > sort_key(existing):
            best_by_session_key[session_key] = item

    return list(best_by_session_key.values())


def _sort_sessions(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda x: (
            _safe_dt(x.get("created_at")),
            _safe_dt(x.get("imported_at")),
            int(x.get("id") or 0),
        ),
        reverse=True,
    )


def _normalize_segment_item(row: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(row or {})
    clip_path = str(item.get("clip_path") or "").strip()
    session_key = _normalize_session_key(item.get("session_key"))

    clip_url = None
    normalized_clip_path = clip_path or None

    if clip_path:
        direct = Path(clip_path)
        if direct.is_absolute() and direct.name and session_key:
            normalized_clip_path = _demo_clip_rel_path(session_key, direct.name)
            clip_url = _normalize_static_url(normalized_clip_path)
        elif clip_path.startswith("/static/") or clip_path.startswith("static/") or clip_path.startswith("demo_outputs/"):
            normalized_clip_path = (
                clip_path.replace("/static/", "", 1)
                if clip_path.startswith("/static/")
                else clip_path.replace("static/", "", 1)
                if clip_path.startswith("static/")
                else clip_path
            )
            clip_url = _normalize_static_url(normalized_clip_path)
        else:
            clip_url = _normalize_static_url(clip_path)

    item["clip_path"] = normalized_clip_path
    item["clip_url"] = clip_url
    return item


def _normalize_telegram_log_item(row: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(row or {})
    clip_path = str(item.get("clip_path") or "").strip()
    session_key = _normalize_session_key(item.get("session_key"))

    clip_url = None
    normalized_clip_path = clip_path or None

    if clip_path:
        direct = Path(clip_path)
        if direct.is_absolute() and direct.name and session_key:
            if "telegram_clips" in clip_path.replace("\\", "/"):
                normalized_clip_path = f"telegram_clips/{direct.name}"
            else:
                normalized_clip_path = _demo_clip_rel_path(session_key, direct.name)
            clip_url = _normalize_static_url(normalized_clip_path)
        elif clip_path.startswith("/static/") or clip_path.startswith("static/") or clip_path.startswith("demo_outputs/") or clip_path.startswith("telegram_clips/"):
            normalized_clip_path = (
                clip_path.replace("/static/", "", 1)
                if clip_path.startswith("/static/")
                else clip_path.replace("static/", "", 1)
                if clip_path.startswith("static/")
                else clip_path
            )
            clip_url = _normalize_static_url(normalized_clip_path)
        else:
            clip_url = _normalize_static_url(clip_path)

    item["clip_path"] = normalized_clip_path
    item["clip_url"] = clip_url
    return item


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(float(value))
    except Exception:
        return default


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _resolve_local_clip_path(clip_path: Optional[str]) -> Optional[Path]:
    if not clip_path:
        return None

    raw = str(clip_path).strip()
    if not raw:
        return None

    direct = Path(raw)
    if direct.exists() and direct.is_file():
        return direct

    demo_output_candidate = _resolve_demo_output_path_from_any(raw)
    if demo_output_candidate:
        return demo_output_candidate

    if raw.startswith("/static/"):
        relative = raw.replace("/static/", "", 1)
        candidate = settings.DATA_DIR / relative
        if candidate.exists() and candidate.is_file():
            return candidate

    if raw.startswith("static/"):
        relative = raw.replace("static/", "", 1)
        candidate = settings.DATA_DIR / relative
        if candidate.exists() and candidate.is_file():
            return candidate

    if raw.startswith("telegram_clips/"):
        relative = raw.replace("telegram_clips/", "", 1)
        candidate = settings.TELEGRAM_CLIPS_DIR / relative
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def _resolve_existing_phone_clip_segment(
    session_id: int,
    window_start_sec: float,
    window_end_sec: float,
) -> Optional[Dict[str, Any]]:
    segments = get_behavior_segments_by_session_id(session_id)
    overlap_candidates = []

    for seg in segments:
        label = str(seg.get("label") or "").strip().lower()
        if label != "using_phone":
            continue

        start_sec = _safe_float(seg.get("start_time_sec"), -1.0)
        end_sec = _safe_float(seg.get("end_time_sec"), -1.0)
        if start_sec < 0 or end_sec < 0:
            continue

        overlaps = start_sec <= window_end_sec and end_sec >= window_start_sec
        if not overlaps:
            continue

        overlap_candidates.append(seg)

    if not overlap_candidates:
        return None

    best = max(
        overlap_candidates,
        key=lambda row: (
            _safe_float(row.get("duration_sec"), 0.0),
            _safe_float(row.get("peak_conf"), 0.0),
        ),
    )
    return dict(best)


def _build_window_clip_output_path(
    session_key: str,
    window_start_sec: float,
    window_end_sec: float,
) -> Path:
    settings.TELEGRAM_CLIPS_DIR.mkdir(parents=True, exist_ok=True)

    safe_start = int(max(0, math.floor(window_start_sec)))
    safe_end = int(max(safe_start, math.ceil(window_end_sec)))
    filename = f"{session_key}_{safe_start}s_{safe_end}s.mp4"
    return settings.TELEGRAM_CLIPS_DIR / filename


def _cut_video_clip_ffmpeg(
    source_video: Path,
    output_path: Path,
    start_sec: float,
    duration_sec: float,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("Không tìm thấy ffmpeg trong PATH.")

    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        str(max(0.0, start_sec)),
        "-i",
        str(source_video),
        "-t",
        str(max(0.1, duration_sec)),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Cắt clip ffmpeg thất bại: {completed.stderr.strip() or completed.stdout.strip() or 'unknown error'}"
        )

    if not output_path.exists():
        raise RuntimeError("ffmpeg chạy xong nhưng clip output không tồn tại.")

    return output_path


def _build_telegram_caption(
    session: Dict[str, Any],
    class_name: str,
    window_start_sec: float,
    window_end_sec: float,
    reason: Optional[str],
) -> str:
    session_key = _normalize_session_key(session.get("session_key"))
    lines = [
        "[AI Classroom Alert]",
        "",
        f"Lớp: {class_name}",
        f"Session: {session_key}",
        f"Khoảng thời gian: {int(window_start_sec)}s - {int(window_end_sec)}s",
    ]
    if reason:
        lines.append(f"Lý do: {reason.strip()}")
    lines.append("")
    lines.append("Hệ thống đã đính kèm clip 5 giây để giáo viên xem nhanh.")
    return "\n".join(lines)


def _send_telegram_video(
    clip_file: Path,
    caption: str,
) -> dict[str, Any]:
    bot_token = settings.TELEGRAM_BOT_TOKEN.strip()
    chat_id = settings.TELEGRAM_CHAT_ID.strip()

    if not bot_token:
        raise RuntimeError("Thiếu TELEGRAM_BOT_TOKEN trong .env")
    if not chat_id:
        raise RuntimeError("Thiếu TELEGRAM_CHAT_ID trong .env")

    url = f"{settings.TELEGRAM_API_BASE.rstrip('/')}/bot{bot_token}/sendVideo"

    with clip_file.open("rb") as f:
        files = {
            "video": (clip_file.name, f, "video/mp4"),
        }
        data = {
            "chat_id": chat_id,
            "caption": caption,
        }

        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, data=data, files=files)

    if response.status_code >= 400:
        raise RuntimeError(
            f"Telegram API lỗi {response.status_code}: {response.text}"
        )

    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram API trả lỗi: {payload}")

    return payload


def _build_log_reason(
    reason: Optional[str],
    log_label: str,
    class_name: str,
    window_start_sec: float,
    window_end_sec: float,
) -> str:
    normalized_reason = str(reason or "").strip()
    if normalized_reason:
        return normalized_reason

    if log_label in {"using_phone", "existing_phone_clip"}:
        return (
            f"{class_name} đang có nhiều sinh viên sử dụng điện thoại "
            f"trong khoảng {int(window_start_sec)}s → {int(window_end_sec)}s."
        )

    if log_label == "sleeping":
        return (
            f"{class_name} có dấu hiệu ngủ gật "
            f"trong khoảng {int(window_start_sec)}s → {int(window_end_sec)}s."
        )

    if log_label == "turning":
        return (
            f"{class_name} có nhiều hành vi quay ngang / mất tập trung "
            f"trong khoảng {int(window_start_sec)}s → {int(window_end_sec)}s."
        )

    return (
        f"Đoạn tiêu cực nổi bật của {class_name} "
        f"trong khoảng {int(window_start_sec)}s → {int(window_end_sec)}s."
    )


def _build_log_message(
    session_key: str,
    class_name: str,
    window_start_sec: float,
    window_end_sec: float,
    reason_text: str,
) -> str:
    return (
        f"[{class_name}] {session_key} | "
        f"{int(window_start_sec)}s → {int(window_end_sec)}s | "
        f"{reason_text}"
    )


def get_sessions_list():
    rows = list_sessions()
    items = [_normalize_session_item(row) for row in rows]
    items = _dedupe_sessions(items)
    items = [item for item in items if _is_usable_session(item)]

    for item in items:
        item.pop("has_displayable_assets", None)

    return _sort_sessions(items)


def get_valid_sessions_list():
    return get_sessions_list()


def get_session_detail(session_id: int):
    row = get_session_by_id(session_id)
    if not row:
        return None

    item = _normalize_session_item(row)
    if not item.get("session_key"):
        return None

    if not _is_usable_session(item):
        return None

    item.pop("has_displayable_assets", None)
    return item


def get_behavior_distribution(session_id: int):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    rows = get_behavior_events_by_session_id(session_id)
    labels = [str(row["label"]) for row in rows if row.get("label") is not None]

    counter = Counter(labels)
    total = sum(counter.values())

    items = []
    for label, count in sorted(counter.items(), key=lambda x: (-x[1], x[0])):
        items.append({"label": label, "count": count})

    positive_count = sum(counter.get(label, 0) for label in POSITIVE_LABELS)
    negative_count = sum(counter.get(label, 0) for label in NEGATIVE_LABELS)

    positive_ratio = round((positive_count / total) * 100, 1) if total > 0 else 0.0
    negative_ratio = round((negative_count / total) * 100, 1) if total > 0 else 0.0

    normalized_session.pop("has_displayable_assets", None)
    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "total_events": total,
        "positive_count": positive_count,
        "negative_count": negative_count,
        "positive_ratio": positive_ratio,
        "negative_ratio": negative_ratio,
        "items": items,
    }


def get_behavior_segments(session_id: int):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    rows = get_behavior_segments_by_session_id(session_id)
    items = [_normalize_segment_item(row) for row in rows]
    normalized_session.pop("has_displayable_assets", None)

    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "items": items,
        "total": len(items),
    }


def get_telegram_logs(session_id: int):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    rows = get_telegram_logs_by_session_id(session_id)
    items = [_normalize_telegram_log_item(row) for row in rows]
    normalized_session.pop("has_displayable_assets", None)

    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "items": items,
        "total": len(items),
    }


def seed_telegram_logs_from_segments(session_id: int):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    existing_logs = get_telegram_logs_by_session_id(session_id)
    if existing_logs:
        normalized_session.pop("has_displayable_assets", None)
        return {
            "session_id": session_id,
            "class_name": normalized_session["class_name"],
            "inserted_logs": 0,
            "message": "Telegram logs already exist for this session",
        }

    segments = get_behavior_segments_by_session_id(session_id)
    rows = []

    for seg in segments:
        rows.append(
            {
                "session_id": session_id,
                "segment_id": seg.get("segment_id"),
                "target_id": seg.get("target_id"),
                "label": seg.get("label"),
                "clip_path": seg.get("clip_path"),
                "status": "pending",
                "message": "Seeded from behavior_segments for demo",
            }
        )

    inserted = insert_telegram_logs(rows)
    normalized_session.pop("has_displayable_assets", None)

    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "inserted_logs": inserted,
        "message": "Telegram logs seeded successfully",
    }


def get_top_phone_window(session_id: int, window_sec: int = 5):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    rows = get_behavior_event_rows_for_windows(session_id)
    normalized_session.pop("has_displayable_assets", None)

    if not rows:
        return {
            "session_id": session_id,
            "class_name": normalized_session["class_name"],
            "window_sec": window_sec,
            "window_start_sec": 0.0,
            "window_end_sec": float(window_sec),
            "distinct_target_count": 0,
            "event_count": 0,
            "target_ids": [],
            "label": "using_phone",
        }

    bucket_targets = defaultdict(set)
    bucket_event_count = defaultdict(int)

    for row in rows:
        label = str(row.get("label", ""))
        if label != "using_phone":
            continue

        time_sec = float(row["time_sec"])
        target_id = int(row["target_id"])
        bucket = int(math.floor(time_sec / window_sec))

        bucket_targets[bucket].add(target_id)
        bucket_event_count[bucket] += 1

    if not bucket_targets:
        return {
            "session_id": session_id,
            "class_name": normalized_session["class_name"],
            "window_sec": window_sec,
            "window_start_sec": 0.0,
            "window_end_sec": float(window_sec),
            "distinct_target_count": 0,
            "event_count": 0,
            "target_ids": [],
            "label": "using_phone",
        }

    best_bucket = min(bucket_targets.keys())
    best_target_count = -1
    best_event_count = -1

    for bucket, targets in bucket_targets.items():
        target_count = len(targets)
        event_count = bucket_event_count[bucket]

        if (
            target_count > best_target_count
            or (target_count == best_target_count and event_count > best_event_count)
            or (
                target_count == best_target_count
                and event_count == best_event_count
                and bucket < best_bucket
            )
        ):
            best_bucket = bucket
            best_target_count = target_count
            best_event_count = event_count

    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "window_sec": window_sec,
        "window_start_sec": round(best_bucket * window_sec, 3),
        "window_end_sec": round((best_bucket + 1) * window_sec, 3),
        "distinct_target_count": best_target_count,
        "event_count": best_event_count,
        "target_ids": sorted(list(bucket_targets[best_bucket])),
        "label": "using_phone",
    }


def get_top_negative_window(session_id: int, window_sec: int = 5):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    rows = get_behavior_event_rows_for_windows(session_id)
    normalized_session.pop("has_displayable_assets", None)

    if not rows:
        return {
            "session_id": session_id,
            "class_name": normalized_session["class_name"],
            "window_sec": window_sec,
            "window_start_sec": 0.0,
            "window_end_sec": float(window_sec),
            "negative_score": 0,
            "breakdown": {
                "using_phone": 0,
                "sleeping": 0,
                "turning": 0,
            },
        }

    bucket_scores = defaultdict(int)
    bucket_breakdown = defaultdict(
        lambda: {"using_phone": 0, "sleeping": 0, "turning": 0}
    )

    for row in rows:
        label = str(row.get("label", ""))
        if label not in NEGATIVE_WEIGHTS:
            continue

        time_sec = float(row["time_sec"])
        bucket = int(math.floor(time_sec / window_sec))

        bucket_scores[bucket] += NEGATIVE_WEIGHTS[label]
        bucket_breakdown[bucket][label] += 1

    if not bucket_scores:
        return {
            "session_id": session_id,
            "class_name": normalized_session["class_name"],
            "window_sec": window_sec,
            "window_start_sec": 0.0,
            "window_end_sec": float(window_sec),
            "negative_score": 0,
            "breakdown": {
                "using_phone": 0,
                "sleeping": 0,
                "turning": 0,
            },
        }

    best_bucket = min(bucket_scores.keys())
    best_score = -1

    for bucket, score in bucket_scores.items():
        if score > best_score or (score == best_score and bucket < best_bucket):
            best_bucket = bucket
            best_score = score

    return {
        "session_id": session_id,
        "class_name": normalized_session["class_name"],
        "window_sec": window_sec,
        "window_start_sec": round(best_bucket * window_sec, 3),
        "window_end_sec": round((best_bucket + 1) * window_sec, 3),
        "negative_score": best_score,
        "breakdown": bucket_breakdown[best_bucket],
    }


def send_telegram_window(
    session_id: int,
    window_start_sec: float,
    window_end_sec: float,
    reason: Optional[str] = None,
    class_name_override: Optional[str] = None,
    use_existing_phone_clip_first: bool = True,
):
    session = get_session_by_id(session_id)
    if not session:
        return None

    normalized_session = _normalize_session_item(session)
    if not _is_usable_session(normalized_session):
        return None

    session_key = normalized_session["session_key"]
    class_name = class_name_override or normalized_session["class_name"] or "Unknown"

    start_sec = max(0.0, _safe_float(window_start_sec, 0.0))
    end_sec = max(start_sec, _safe_float(window_end_sec, start_sec + 5.0))

    clip_path_to_send: Optional[Path] = None
    clip_log_path: Optional[str] = None
    log_label = "negative_window"
    related_segment_id: Optional[int] = None
    related_target_id: Optional[int] = None

    if use_existing_phone_clip_first:
        existing_phone_seg = _resolve_existing_phone_clip_segment(
            session_id=session_id,
            window_start_sec=start_sec,
            window_end_sec=end_sec,
        )
        if existing_phone_seg:
            candidate = _resolve_local_clip_path(existing_phone_seg.get("clip_path"))
            if candidate and candidate.exists() and candidate.is_file():
                clip_path_to_send = candidate
                clip_log_path = _demo_clip_rel_path(session_key, candidate.name)
                log_label = str(existing_phone_seg.get("label") or "using_phone")
                related_segment_id = _safe_int(existing_phone_seg.get("segment_id")) or None
                related_target_id = _safe_int(existing_phone_seg.get("target_id")) or None

    if clip_path_to_send is None:
        annotated_video = _resolve_local_annotated_video(session)
        if not annotated_video:
            raise RuntimeError("Không tìm thấy annotated_video.mp4 để cắt clip Telegram.")

        output_path = _build_window_clip_output_path(
            session_key=session_key,
            window_start_sec=start_sec,
            window_end_sec=end_sec,
        )
        clip_duration = min(5.0, max(1.0, end_sec - start_sec))
        clip_path_to_send = _cut_video_clip_ffmpeg(
            source_video=annotated_video,
            output_path=output_path,
            start_sec=start_sec,
            duration_sec=clip_duration,
        )
        clip_log_path = f"telegram_clips/{clip_path_to_send.name}"

    reason_text = _build_log_reason(
        reason=reason,
        log_label=log_label,
        class_name=class_name,
        window_start_sec=start_sec,
        window_end_sec=end_sec,
    )

    caption = _build_telegram_caption(
        session=session,
        class_name=class_name,
        window_start_sec=start_sec,
        window_end_sec=end_sec,
        reason=reason_text,
    )

    response_payload = _send_telegram_video(
        clip_file=clip_path_to_send,
        caption=caption,
    )

    sent_at = _iso_now()
    log_message = _build_log_message(
        session_key=session_key,
        class_name=class_name,
        window_start_sec=start_sec,
        window_end_sec=end_sec,
        reason_text=reason_text,
    )

    insert_telegram_logs(
        [
            {
                "session_id": session_id,
                "segment_id": related_segment_id,
                "target_id": related_target_id,
                "label": log_label,
                "clip_path": clip_log_path,
                "status": "sent",
                "message": log_message,
                "sent_at": sent_at,
            }
        ]
    )

    return {
        "session_id": session_id,
        "session_key": session_key,
        "class_name": class_name,
        "window_start_sec": start_sec,
        "window_end_sec": end_sec,
        "clip_path": clip_log_path,
        "telegram_status": "sent",
        "message": "Đã gửi clip Telegram thành công.",
        "reason": reason_text,
        "sent_at": sent_at,
        "telegram_response": response_payload,
    }