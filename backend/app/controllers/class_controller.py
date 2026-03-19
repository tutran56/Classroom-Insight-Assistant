from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.schemas.class_schema import ClassItemResponse, ClassListResponse
from app.schemas.import_schema import ImportResultResponse
from app.schemas.output_schema import OutputPreviewResponse
from app.services.class_service import get_class_by_key, list_classes
from app.services.import_service import import_class_output_to_supabase
from app.services.output_reader_service import get_output_preview

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=ClassListResponse)
def get_classes():
    items = list_classes()
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/{class_key}", response_model=ClassItemResponse)
def get_class_detail(class_key: str):
    item = get_class_by_key(class_key)
    if not item:
        raise HTTPException(status_code=404, detail="Class not found")
    return item


@router.get("/{class_key}/preview", response_model=OutputPreviewResponse)
def get_class_output_preview(
    class_key: str,
    limit: int = Query(default=10, ge=1, le=50),
    session_key: str | None = Query(default=None),
):
    target_key = (session_key or class_key or "").strip()
    preview = get_output_preview(class_key=target_key, limit=limit)
    if not preview:
        raise HTTPException(status_code=404, detail="Output not found")
    return preview


@router.post("/{class_key}/import", response_model=ImportResultResponse)
def import_class_output(
    class_key: str,
    session_key: str | None = Query(default=None),
):
    target_key = (session_key or class_key or "").strip()
    if not target_key:
        raise HTTPException(status_code=400, detail="Missing import target")

    result = import_class_output_to_supabase(target_key)
    if result:
        return result

    session_dir = settings.DEMO_OUTPUTS_DIR / target_key
    if session_key and (not session_dir.exists() or not session_dir.is_dir()):
        raise HTTPException(status_code=404, detail="Session output not found")

    legacy_class_dir = settings.DEMO_OUTPUTS_DIR / class_key
    if legacy_class_dir.exists() and legacy_class_dir.is_dir() and not session_key:
        raise HTTPException(
            status_code=409,
            detail=(
                "Legacy class-based import is no longer the stable flow. "
                "Please call this endpoint with ?session_key=<session_key> to import a completed job output."
            ),
        )

    raise HTTPException(status_code=404, detail="Import target not found or artifacts are incomplete")