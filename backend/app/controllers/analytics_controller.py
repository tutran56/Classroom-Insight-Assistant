from fastapi import APIRouter, HTTPException, Query

from app.schemas.ai_schema import AICommentaryResponse
from app.schemas.analytics_schema import (
    BehaviorDistributionResponse,
    BehaviorSegmentListResponse,
    SessionListResponse,
    SessionResponse,
    TelegramLogListResponse,
    TopNegativeWindowResponse,
    TopPhoneWindowResponse,
)
from app.schemas.search_schema import (
    PromptSearchRequest,
    PromptSearchResponse,
)
from app.schemas.telegram_seed_schema import TelegramSeedResponse
from app.schemas.telegram_send_schema import (
    TelegramSendWindowRequest,
    TelegramSendWindowResponse,
)
from app.services.ai_service import get_ai_commentary
from app.services.analytics_service import (
    get_behavior_distribution,
    get_behavior_segments,
    get_session_detail,
    get_sessions_list,
    get_telegram_logs,
    get_top_negative_window,
    get_top_phone_window,
    get_valid_sessions_list,
    seed_telegram_logs_from_segments,
    send_telegram_window,
)
from app.services.prompt_search_service import search_session_by_prompt

router = APIRouter(tags=["analytics"])


@router.get("/classes-db", response_model=SessionListResponse)
def list_classes_db():
    items = get_sessions_list()
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/classes-db/valid", response_model=SessionListResponse)
def list_valid_classes_db():
    items = get_valid_sessions_list()
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/classes-db/{session_id}", response_model=SessionResponse)
def get_class_db_detail(session_id: int):
    item = get_session_detail(session_id)
    if not item:
        raise HTTPException(status_code=404, detail="Session not found")
    return item


@router.get(
    "/classes-db/{session_id}/behavior-distribution",
    response_model=BehaviorDistributionResponse,
)
def behavior_distribution(session_id: int):
    result = get_behavior_distribution(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get(
    "/classes-db/{session_id}/segments",
    response_model=BehaviorSegmentListResponse,
)
def behavior_segments(session_id: int):
    result = get_behavior_segments(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get(
    "/classes-db/{session_id}/telegram-logs",
    response_model=TelegramLogListResponse,
)
def telegram_logs(session_id: int):
    result = get_telegram_logs(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.post(
    "/classes-db/{session_id}/seed-telegram-logs",
    response_model=TelegramSeedResponse,
)
def seed_telegram_logs(session_id: int):
    result = seed_telegram_logs_from_segments(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.post(
    "/classes-db/{session_id}/telegram-send-window",
    response_model=TelegramSendWindowResponse,
)
def telegram_send_window(session_id: int, payload: TelegramSendWindowRequest):
    result = send_telegram_window(
        session_id=session_id,
        window_start_sec=payload.window_start_sec,
        window_end_sec=payload.window_end_sec,
        reason=payload.reason,
        class_name_override=payload.class_name,
        use_existing_phone_clip_first=payload.use_existing_phone_clip_first,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get(
    "/classes-db/{session_id}/top-phone-window",
    response_model=TopPhoneWindowResponse,
)
def top_phone_window(
    session_id: int,
    window_sec: int = Query(default=5, ge=1, le=60),
):
    result = get_top_phone_window(session_id=session_id, window_sec=window_sec)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get(
    "/classes-db/{session_id}/top-negative-window",
    response_model=TopNegativeWindowResponse,
)
def top_negative_window(
    session_id: int,
    window_sec: int = Query(default=5, ge=1, le=60),
):
    result = get_top_negative_window(session_id=session_id, window_sec=window_sec)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get(
    "/classes-db/{session_id}/ai-commentary",
    response_model=AICommentaryResponse,
)
def ai_commentary(session_id: int):
    result = get_ai_commentary(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.post(
    "/classes-db/{session_id}/prompt-search",
    response_model=PromptSearchResponse,
)
def prompt_search(session_id: int, payload: PromptSearchRequest):
    result = search_session_by_prompt(session_id=session_id, prompt=payload.query)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result