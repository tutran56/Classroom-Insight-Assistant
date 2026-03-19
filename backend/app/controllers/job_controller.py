from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.job_schema import (
    JobCreateResponse,
    JobResultResponse,
    JobStatusResponse,
)
from app.services.job_service import (
    create_job_from_upload,
    get_job_result,
    get_job_status,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _normalize_class_name(value: Optional[str]) -> str:
    text = (value or "").strip().lower()

    if "classroom_b" in text or text == "b":
        return "classroom_b"

    return "classroom_a"


def _resolve_upload_class_name(
    class_name: Optional[str],
    class_id: Optional[str],
) -> str:
    """
    Backward-compatible:
    - FE mới có thể gửi class_name
    - FE cũ có thể gửi class_id
    """
    preferred = (class_name or "").strip()
    fallback = (class_id or "").strip()

    if preferred:
        return _normalize_class_name(preferred)

    if fallback:
        return _normalize_class_name(fallback)

    return "classroom_a"


def _is_supported_video_filename(filename: str) -> bool:
    lower = filename.lower()
    allowed = (".mp4", ".mov", ".m4v", ".avi", ".mkv")
    return lower.endswith(allowed)


@router.post("/upload", response_model=JobCreateResponse)
async def upload_job(
    file: UploadFile = File(...),
    class_name: Optional[str] = Form(None),
    class_id: Optional[str] = Form(None),
):
    if not file:
        raise HTTPException(status_code=400, detail="Missing upload file")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name")

    if not _is_supported_video_filename(file.filename):
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format. Use mp4, mov, m4v, avi, or mkv.",
        )

    normalized_class_name = _resolve_upload_class_name(
        class_name=class_name,
        class_id=class_id,
    )

    try:
        return await create_job_from_upload(
            file=file,
            class_name=normalized_class_name,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create job: {e}",
        )


@router.get("/{job_id}/status", response_model=JobStatusResponse)
def job_status(job_id: str):
    try:
        result = get_job_status(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job status: {e}",
        )

    if not result:
        raise HTTPException(status_code=404, detail="Job not found")

    return result


@router.get("/{job_id}/result", response_model=JobResultResponse)
def job_result(job_id: str):
    try:
        result = get_job_result(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job result: {e}",
        )

    if not result:
        raise HTTPException(status_code=404, detail="Job not found")

    return result