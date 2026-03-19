import csv
import json
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.core.config import settings
from app.repositories.session_repository import get_session_by_key
from app.services.gdrive_service import (
    create_drive_folder,
    download_drive_folder_to_local,
    find_drive_file_by_name,
    find_drive_folder_by_name,
    read_drive_json,
    upload_file_to_drive,
    upload_text_content_to_drive,
)
from app.services.import_service import import_class_output_to_supabase


SYNC_RETRY_COUNT = 5
SYNC_RETRY_SLEEP_SEC = 0.6
LOCAL_RESULT_PARSE_RETRY_COUNT = 6
LOCAL_RESULT_PARSE_RETRY_SLEEP_SEC = 0.4

# Quan trọng:
# Job chỉ được coi là stable khi đã có đủ các artifact tối thiểu, bao gồm cả video annotated.
REQUIRED_RESULT_FILES = (
    "result.json",
    "events_frame.csv",
    "phone_segments.csv",
    "annotated_video.mp4",
)


def _now_compact() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _safe_read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None

    try:
        raw = path.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"[WARN] Failed reading JSON file {path}: {e}")
        return None

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[WARN] Invalid/partial JSON in {path}: {e}")
        return None

    return parsed if isinstance(parsed, dict) else None


def _ensure_dirs() -> None:
    settings.DEMO_OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / "tmp_jobs").mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / "tmp_sync").mkdir(parents=True, exist_ok=True)


def _to_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_str(value: Any, default: Optional[str] = None) -> Optional[str]:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_class_key_input(value: Optional[str]) -> str:
    text = (value or "").strip().lower()

    if "classroom_a" in text or text == "a":
        return "classroom_a"

    if "classroom_b" in text or text == "b":
        return "classroom_b"

    return "classroom_a"


def _asset_rel_path(session_key: str, file_name: str) -> str:
    return f"demo_outputs/{session_key}/{file_name}"


def _asset_rel_path_in_clips(session_key: str, file_name: str) -> str:
    return f"demo_outputs/{session_key}/clips/{file_name}"


def _asset_url(rel_path: Optional[str]) -> Optional[str]:
    if not rel_path:
        return None
    rel = rel_path.replace("\\", "/").lstrip("/")
    return f"/static/{rel}"


def _session_output_dir(session_key: str) -> Path:
    return settings.DEMO_OUTPUTS_DIR / session_key


def _required_local_output_paths(session_key: str) -> List[Path]:
    session_dir = _session_output_dir(session_key)
    return [session_dir / name for name in REQUIRED_RESULT_FILES]


def _required_drive_output_names() -> List[str]:
    return list(REQUIRED_RESULT_FILES)


def _has_minimum_local_outputs(session_key: str) -> bool:
    return all(path.exists() and path.is_file() for path in _required_local_output_paths(session_key))


def _has_valid_local_result_json(session_key: str) -> bool:
    result_path = _session_output_dir(session_key) / "result.json"
    parsed = _safe_read_json(result_path)
    if not parsed:
        return False

    summary = parsed.get("summary")
    return isinstance(summary, dict) and bool(summary)


def _has_valid_local_annotated_video(session_key: str) -> bool:
    annotated_path = _session_output_dir(session_key) / "annotated_video.mp4"
    if not annotated_path.exists() or not annotated_path.is_file():
        return False

    try:
        return annotated_path.stat().st_size > 0
    except Exception:
        return False


def _has_stable_local_outputs(session_key: str) -> bool:
    return (
        _has_minimum_local_outputs(session_key)
        and _has_valid_local_result_json(session_key)
        and _has_valid_local_annotated_video(session_key)
    )


def _read_csv_rows(csv_path: Path) -> List[Dict[str, Any]]:
    if not csv_path.exists():
        return []

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _load_drive_job_json_from_folder(folder_id: str) -> Dict[str, Any]:
    job_file = find_drive_file_by_name(folder_id, "job.json")
    return read_drive_json(job_file["id"]) if job_file else {}


def _load_drive_status_json_from_folder(folder_id: str) -> Dict[str, Any]:
    status_file = find_drive_file_by_name(folder_id, "status.json")
    return read_drive_json(status_file["id"]) if status_file else {}


def _resolve_session_key(job_id: str, job_json: Optional[Dict[str, Any]]) -> str:
    if not job_json:
        return job_id

    for key in ("session_id", "session_key", "job_id"):
        value = _to_str(job_json.get(key))
        if value:
            return value

    return job_id


def _result_stub_payload(
    job_id: str,
    session_key: str,
    status: str,
    session_id: Optional[int] = None,
) -> Dict[str, Any]:
    return {
        "job_id": job_id,
        "session_key": session_key,
        "status": status,
        "session_id": session_id,
        "summary": None,
        "label_distribution": {},
        "assets": None,
        "phone_segments": [],
        "clips": [],
        "events_preview": [],
        "result_json": None,
    }


def _get_local_pending_job_status(job_id: str):
    """
    Nếu job vừa tạo ở local nhưng Drive chưa nhìn thấy ngay,
    vẫn trả queued để FE không bị 404 nháy.
    """
    job_dir = settings.DATA_DIR / "tmp_jobs" / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        return None

    job_json_path = job_dir / "job.json"
    job_json = _safe_read_json(job_json_path) or {}
    session_key = _resolve_session_key(job_id, job_json)

    return {
        "job_id": job_id,
        "session_key": session_key,
        "status": "queued",
        "progress": 0,
        "message": "Job created locally, waiting for Drive visibility",
        "updated_at": None,
        "result_ready": False,
        "imported": False,
        "session_id": None,
    }


async def _save_upload_file(upload: UploadFile, target_path: Path) -> None:
    chunk_size = 1024 * 1024

    with open(target_path, "wb") as out:
        while True:
            chunk = await upload.read(chunk_size)
            if not chunk:
                break
            out.write(chunk)

    await upload.close()


async def create_job_from_upload(file: UploadFile, class_name: str = "classroom_a"):
    _ensure_dirs()

    class_key = _normalize_class_key_input(class_name)
    session_key = f"{class_key}_{_now_compact()}"
    job_id = session_key

    job_dir = settings.DATA_DIR / "tmp_jobs" / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)

    # Giữ nguyên convention input.mp4 để worker không bị lệch contract hiện tại.
    # Dù user upload .mov, content vẫn được ghi binary vào file này.
    input_video_path = job_dir / "input.mp4"
    await _save_upload_file(file, input_video_path)

    job_json = {
        "job_id": job_id,
        "session_id": session_key,
        "session_key": session_key,
        "class_id": class_key,
        "class_name": class_key,
        "teacher_name": None,
        "input_video": "input.mp4",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "status": "queued",
    }

    with open(job_dir / "job.json", "w", encoding="utf-8") as f:
        json.dump(job_json, f, ensure_ascii=False, indent=2)

    if not settings.GOOGLE_DRIVE_INCOMING_FOLDER_ID:
        raise ValueError("Missing GOOGLE_DRIVE_INCOMING_FOLDER_ID in environment")

    job_folder_id = create_drive_folder(
        name=job_id,
        parent_id=settings.GOOGLE_DRIVE_INCOMING_FOLDER_ID,
    )

    upload_file_to_drive(
        local_path=input_video_path,
        file_name="input.mp4",
        parent_id=job_folder_id,
        mime_type=file.content_type or "video/mp4",
    )

    upload_text_content_to_drive(
        content=json.dumps(job_json, ensure_ascii=False, indent=2),
        file_name="job.json",
        parent_id=job_folder_id,
        mime_type="application/json",
    )

    return {
        "job_id": job_id,
        "session_key": session_key,
        "status": "queued",
    }


def _find_done_folder(job_id: str):
    if not settings.GOOGLE_DRIVE_DONE_FOLDER_ID:
        return None
    return find_drive_folder_by_name(settings.GOOGLE_DRIVE_DONE_FOLDER_ID, job_id)


def _find_processing_folder(job_id: str):
    if not settings.GOOGLE_DRIVE_PROCESSING_FOLDER_ID:
        return None
    return find_drive_folder_by_name(settings.GOOGLE_DRIVE_PROCESSING_FOLDER_ID, job_id)


def _find_incoming_folder(job_id: str):
    if not settings.GOOGLE_DRIVE_INCOMING_FOLDER_ID:
        return None
    return find_drive_folder_by_name(settings.GOOGLE_DRIVE_INCOMING_FOLDER_ID, job_id)


def _find_failed_folder(job_id: str):
    if not settings.GOOGLE_DRIVE_FAILED_FOLDER_ID:
        return None
    return find_drive_folder_by_name(settings.GOOGLE_DRIVE_FAILED_FOLDER_ID, job_id)


def _done_folder_has_minimum_outputs(done_folder_id: str) -> bool:
    for name in _required_drive_output_names():
        file_meta = find_drive_file_by_name(done_folder_id, name)
        if not file_meta:
            return False
    return True


def _locate_downloaded_output_root(tmp_dir: Path, session_key: str) -> Optional[Path]:
    candidates = [
        tmp_dir,
        tmp_dir / session_key,
    ]

    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate

    if tmp_dir.parent.exists():
        for child in tmp_dir.parent.iterdir():
            if child.is_dir() and child.name in {
                session_key,
                f"{session_key}__downloading",
            }:
                return child

    return None


def sync_done_job_to_demo_outputs(job_id: str):
    """
    Chỉ sync artifact thực tế của folder done.
    Không giả định done phải có job.json hay input.mp4.
    Có retry ngắn để giảm race Drive sau khi worker vừa move job sang done.
    """
    done_folder = _find_done_folder(job_id)
    if not done_folder:
        return None

    session_key = job_id
    target_dir = settings.DEMO_OUTPUTS_DIR / session_key
    tmp_root = settings.DATA_DIR / "tmp_sync"
    tmp_dir = tmp_root / f"{session_key}__downloading"
    backup_dir = tmp_root / f"{session_key}__backup"

    tmp_root.mkdir(parents=True, exist_ok=True)

    last_error: Optional[Exception] = None

    for attempt in range(SYNC_RETRY_COUNT):
        try:
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)
            if backup_dir.exists():
                shutil.rmtree(backup_dir, ignore_errors=True)

            download_drive_folder_to_local(done_folder["id"], tmp_dir)

            downloaded_root = _locate_downloaded_output_root(tmp_dir, session_key)
            if not downloaded_root:
                raise FileNotFoundError(str(tmp_dir))

            minimum_files = [downloaded_root / name for name in REQUIRED_RESULT_FILES]
            if not all(path.exists() and path.is_file() for path in minimum_files):
                missing = [str(path) for path in minimum_files if not path.exists()]
                raise FileNotFoundError(", ".join(missing))

            # Kiểm tra video annotated không được rỗng
            annotated_path = downloaded_root / "annotated_video.mp4"
            if annotated_path.stat().st_size <= 0:
                raise ValueError("annotated_video.mp4 exists but is empty")

            parsed = _safe_read_json(downloaded_root / "result.json")
            if not parsed:
                raise ValueError("result.json is missing or not yet valid JSON")

            summary = parsed.get("summary")
            if not isinstance(summary, dict) or not summary:
                raise ValueError("result.json summary is missing or incomplete")

            if target_dir.exists():
                shutil.move(str(target_dir), str(backup_dir))

            shutil.move(str(downloaded_root), str(target_dir))

            if backup_dir.exists():
                shutil.rmtree(backup_dir, ignore_errors=True)

            if tmp_dir.exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)

            return {
                "job_id": job_id,
                "session_key": session_key,
                "target_dir": str(target_dir),
            }
        except Exception as e:
            last_error = e
            print(
                f"[WARN] sync_done_job_to_demo_outputs attempt {attempt + 1}/{SYNC_RETRY_COUNT} "
                f"failed for {job_id}: {e}"
            )
            time.sleep(SYNC_RETRY_SLEEP_SEC)

    if last_error:
        raise last_error

    return None


def _ensure_imported_session(session_key: str, force_reimport: bool = False) -> Optional[Dict[str, Any]]:
    if not force_reimport:
        existing = get_session_by_key(session_key)
        if existing:
            return existing

    try:
        import_result = import_class_output_to_supabase(session_key)
        if import_result:
            return get_session_by_key(session_key)
    except Exception as e:
        print(f"[WARN] import_class_output_to_supabase failed for {session_key}: {e}")

    return get_session_by_key(session_key)


def _ensure_done_job_ready(job_id: str, session_key: str) -> Dict[str, Any]:
    """
    Một job chỉ được coi là ready khi đủ cả:
    - folder done có đủ artifact tối thiểu, bao gồm annotated_video.mp4
    - local sync xong và result.json parse được ổn định
    - annotated_video.mp4 đã có thật ở local và không rỗng
    - session đã import được vào DB
    """
    ready = False
    synced = False
    imported = False
    session = get_session_by_key(session_key)
    session_id = session["id"] if session else None

    done_folder = _find_done_folder(job_id)
    if not done_folder:
        return {
            "ready": False,
            "synced": False,
            "imported": imported,
            "session": session,
            "session_id": session_id,
        }

    if not _done_folder_has_minimum_outputs(done_folder["id"]):
        return {
            "ready": False,
            "synced": False,
            "imported": imported,
            "session": session,
            "session_id": session_id,
        }

    if not _has_stable_local_outputs(session_key):
        try:
            sync_done_job_to_demo_outputs(job_id)
        except Exception as e:
            print(f"[WARN] sync_done_job_to_demo_outputs failed for {job_id}: {e}")

    synced = _has_stable_local_outputs(session_key)

    if synced:
        session = _ensure_imported_session(session_key)
        imported = session is not None
        session_id = session["id"] if session else None

    ready = synced and imported

    return {
        "ready": ready,
        "synced": synced,
        "imported": imported,
        "session": session,
        "session_id": session_id,
    }


def get_job_status(job_id: str):
    done_folder = _find_done_folder(job_id)

    if done_folder:
        status_json = _load_drive_status_json_from_folder(done_folder["id"])
        job_json = _load_drive_job_json_from_folder(done_folder["id"])
        session_key = _resolve_session_key(job_id, job_json)

        stable = _ensure_done_job_ready(job_id=job_id, session_key=session_key)
        raw_status = _to_str(status_json.get("status"), "done") or "done"
        raw_message = _to_str(status_json.get("message"), "") or ""

        if raw_status == "done" and not stable["ready"]:
            message = raw_message or "Finalizing result sync"
        else:
            message = raw_message

        return {
            "job_id": job_id,
            "session_key": session_key,
            "status": raw_status,
            "progress": _to_int(status_json.get("progress"), 100) or 100,
            "message": message,
            "updated_at": status_json.get("updated_at"),
            "result_ready": stable["ready"],
            "imported": stable["imported"],
            "session_id": stable["session_id"],
        }

    incoming_folder = _find_incoming_folder(job_id)
    if incoming_folder:
        job_json = _load_drive_job_json_from_folder(incoming_folder["id"])
        session_key = _resolve_session_key(job_id, job_json)

        return {
            "job_id": job_id,
            "session_key": session_key,
            "status": "queued",
            "progress": 0,
            "message": "Waiting for Colab worker",
            "updated_at": None,
            "result_ready": False,
            "imported": False,
            "session_id": None,
        }

    processing_folder = _find_processing_folder(job_id)
    if processing_folder:
        status_json = _load_drive_status_json_from_folder(processing_folder["id"])
        job_json = _load_drive_job_json_from_folder(processing_folder["id"])
        session_key = _resolve_session_key(job_id, job_json)

        return {
            "job_id": job_id,
            "session_key": session_key,
            "status": _to_str(status_json.get("status"), "processing"),
            "progress": _to_int(status_json.get("progress"), 1) or 1,
            "message": _to_str(status_json.get("message"), "Processing") or "Processing",
            "updated_at": status_json.get("updated_at"),
            "result_ready": False,
            "imported": False,
            "session_id": None,
        }

    failed_folder = _find_failed_folder(job_id)
    if failed_folder:
        status_json = _load_drive_status_json_from_folder(failed_folder["id"])
        job_json = _load_drive_job_json_from_folder(failed_folder["id"])
        session_key = _resolve_session_key(job_id, job_json)

        return {
            "job_id": job_id,
            "session_key": session_key,
            "status": "failed",
            "progress": _to_int(status_json.get("progress"), 100) or 100,
            "message": _to_str(status_json.get("message"), "Failed") or "Failed",
            "updated_at": status_json.get("updated_at"),
            "result_ready": False,
            "imported": False,
            "session_id": None,
        }

    local_pending = _get_local_pending_job_status(job_id)
    if local_pending:
        return local_pending

    return None


def import_done_job(job_id: str):
    synced = sync_done_job_to_demo_outputs(job_id)
    if not synced:
        return None

    session_key = synced["session_key"]
    import_result = import_class_output_to_supabase(session_key)
    session = get_session_by_key(session_key)

    return {
        "job_id": job_id,
        "session_key": session_key,
        "import_result": import_result,
        "session_id": session["id"] if session else None,
    }


def _build_assets_payload(
    session_key: str,
    result_json: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    raw_annotated = (result_json or {}).get("annotated_video_path") or "annotated_video.mp4"
    raw_events_csv = (result_json or {}).get("events_frame_csv_path") or "events_frame.csv"
    raw_phone_csv = (result_json or {}).get("phone_segments_csv_path") or "phone_segments.csv"
    raw_clips_dir = (result_json or {}).get("clips_dir") or "clips"

    annotated_name = Path(str(raw_annotated)).name
    events_csv_name = Path(str(raw_events_csv)).name
    phone_csv_name = Path(str(raw_phone_csv)).name
    clips_dir_name = Path(str(raw_clips_dir)).name or "clips"

    annotated_rel = _asset_rel_path(session_key, annotated_name)
    events_rel = _asset_rel_path(session_key, events_csv_name)
    phone_rel = _asset_rel_path(session_key, phone_csv_name)
    clips_rel = _asset_rel_path(session_key, clips_dir_name)

    return {
        "annotated_video_path": annotated_rel,
        "annotated_video_url": _asset_url(annotated_rel),
        "events_frame_csv_path": events_rel,
        "events_frame_csv_url": _asset_url(events_rel),
        "phone_segments_csv_path": phone_rel,
        "phone_segments_csv_url": _asset_url(phone_rel),
        "clips_dir": clips_rel,
        "clips_base_url": _asset_url(clips_rel),
    }


def _build_phone_segments_payload(
    session_key: str,
    result_json: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    csv_path = _session_output_dir(session_key) / "phone_segments.csv"
    rows = _read_csv_rows(csv_path)
    items: List[Dict[str, Any]] = []

    if rows:
        for row in rows:
            clip_path_value = _to_str(row.get("clip_path"))
            clip_file = (
                _to_str(row.get("clip_file"))
                or _to_str(row.get("clip_name"))
                or _to_str(row.get("clip_filename"))
                or (Path(clip_path_value).name if clip_path_value else None)
            )

            start_sec = (
                _to_float(row.get("start_sec"))
                if row.get("start_sec") not in (None, "")
                else _to_float(row.get("start_time_sec"))
            )
            end_sec = (
                _to_float(row.get("end_sec"))
                if row.get("end_sec") not in (None, "")
                else _to_float(row.get("end_time_sec"))
            )
            duration_sec = _to_float(row.get("duration_sec"))
            peak_conf = _to_float(row.get("peak_conf"))
            avg_conf = (
                _to_float(row.get("avg_conf"))
                if row.get("avg_conf") not in (None, "")
                else _to_float(row.get("mean_conf"))
            )

            clip_path = (
                _asset_rel_path_in_clips(session_key, clip_file) if clip_file else None
            )

            items.append(
                {
                    "target_id": _to_int(row.get("target_id")),
                    "label": _to_str(row.get("label"), "using_phone"),
                    "start_frame": _to_int(row.get("start_frame")),
                    "end_frame": _to_int(row.get("end_frame")),
                    "start_sec": start_sec,
                    "end_sec": end_sec,
                    "duration_sec": duration_sec,
                    "peak_conf": peak_conf,
                    "avg_conf": avg_conf,
                    "clip_file": clip_file,
                    "clip_path": clip_path,
                    "clip_url": _asset_url(clip_path),
                }
            )

        return items

    raw_events = (result_json or {}).get("events") or []
    for event in raw_events:
        clip_path_value = _to_str(event.get("clip_path"))
        clip_file = Path(clip_path_value).name if clip_path_value else None

        start_sec = _to_float(event.get("start_time_sec"))
        end_sec = _to_float(event.get("end_time_sec"))
        duration_sec = None
        if start_sec is not None and end_sec is not None:
            duration_sec = max(0.0, end_sec - start_sec)

        clip_path = _asset_rel_path_in_clips(session_key, clip_file) if clip_file else None

        items.append(
            {
                "target_id": _to_int(event.get("target_id")),
                "label": _to_str(event.get("label"), "using_phone"),
                "start_frame": None,
                "end_frame": None,
                "start_sec": start_sec,
                "end_sec": end_sec,
                "duration_sec": duration_sec,
                "peak_conf": _to_float(event.get("confidence")),
                "avg_conf": _to_float(event.get("confidence")),
                "clip_file": clip_file,
                "clip_path": clip_path,
                "clip_url": _asset_url(clip_path),
            }
        )

    return items


def _build_clips_payload(phone_segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    clips: List[Dict[str, Any]] = []

    for seg in phone_segments:
        if not seg.get("clip_file"):
            continue

        clips.append(
            {
                "target_id": seg.get("target_id"),
                "label": seg.get("label"),
                "start_sec": seg.get("start_sec"),
                "end_sec": seg.get("end_sec"),
                "duration_sec": seg.get("duration_sec"),
                "clip_file": seg.get("clip_file"),
                "clip_path": seg.get("clip_path"),
                "clip_url": seg.get("clip_url"),
            }
        )

    return clips


def _build_events_preview_payload(
    session_key: str,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    csv_path = _session_output_dir(session_key) / "events_frame.csv"
    rows = _read_csv_rows(csv_path)
    items: List[Dict[str, Any]] = []

    for row in rows[:limit]:
        items.append(
            {
                "frame_idx": _to_int(
                    row.get("frame_idx") or row.get("frame") or row.get("frame_id")
                ),
                "time_sec": _to_float(row.get("time_sec") or row.get("timestamp_sec")),
                "target_id": _to_int(row.get("target_id")),
                "label": _to_str(row.get("label")),
                "confidence": _to_float(
                    row.get("confidence") or row.get("conf") or row.get("score")
                ),
            }
        )

    return items


def _build_summary_payload(
    result_json: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not result_json:
        return None

    summary = result_json.get("summary") or {}
    if not summary:
        return None

    return {
        "session_id": summary.get("session_id"),
        "job_id": summary.get("job_id"),
        "video_name": summary.get("video_name"),
        "video_duration_sec": _to_float(summary.get("video_duration_sec")),
        "num_targets_locked": _to_int(summary.get("num_targets_locked"), 0) or 0,
        "num_frame_events": _to_int(summary.get("num_frame_events"), 0) or 0,
        "num_phone_rows": _to_int(summary.get("num_phone_rows"), 0) or 0,
        "num_phone_segments": _to_int(summary.get("num_phone_segments"), 0) or 0,
        "num_phone_clips_ready": _to_int(summary.get("num_phone_clips_ready"), 0) or 0,
    }


def _build_label_distribution_payload(
    result_json: Optional[Dict[str, Any]],
) -> Dict[str, int]:
    raw = (result_json or {}).get("label_distribution") or {}
    clean: Dict[str, int] = {}

    if isinstance(raw, dict):
        for key, value in raw.items():
            label = _to_str(key)
            if not label:
                continue
            clean[label] = _to_int(value, 0) or 0

    return clean


def get_job_result(job_id: str):
    status = get_job_status(job_id)
    if not status:
        return None

    session_key = status["session_key"]

    if status["status"] != "done":
        return _result_stub_payload(
            job_id=job_id,
            session_key=session_key,
            status=status["status"],
            session_id=status.get("session_id"),
        )

    stable = _ensure_done_job_ready(job_id=job_id, session_key=session_key)
    if not stable["ready"]:
        return _result_stub_payload(
            job_id=job_id,
            session_key=session_key,
            status="done",
            session_id=stable.get("session_id") or status.get("session_id"),
        )

    local_result_path = _session_output_dir(session_key) / "result.json"
    result_json: Optional[Dict[str, Any]] = None
    for _ in range(LOCAL_RESULT_PARSE_RETRY_COUNT):
        result_json = _safe_read_json(local_result_path)
        if result_json is not None:
            break
        time.sleep(LOCAL_RESULT_PARSE_RETRY_SLEEP_SEC)

    if result_json is None:
        print(f"[WARN] Stable job {job_id} has no readable local result.json")
        return _result_stub_payload(
            job_id=job_id,
            session_key=session_key,
            status="done",
            session_id=stable.get("session_id") or status.get("session_id"),
        )

    assets = _build_assets_payload(session_key, result_json)
    phone_segments = _build_phone_segments_payload(session_key, result_json)
    clips = _build_clips_payload(phone_segments)
    events_preview = _build_events_preview_payload(session_key)
    summary = _build_summary_payload(result_json)
    label_distribution = _build_label_distribution_payload(result_json)
    session = stable.get("session") or get_session_by_key(session_key)

    return {
        "job_id": job_id,
        "session_key": session_key,
        "status": "done",
        "session_id": session["id"] if session else status.get("session_id"),
        "summary": summary,
        "label_distribution": label_distribution,
        "assets": assets,
        "phone_segments": phone_segments,
        "clips": clips,
        "events_preview": events_preview,
        "result_json": result_json,
    }