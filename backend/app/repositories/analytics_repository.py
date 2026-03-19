from app.core.supabase_client import get_supabase_client


def list_sessions():
    supabase = get_supabase_client()
    response = (
        supabase.table("sessions")
        .select("*")
        .order("id")
        .execute()
    )
    return response.data or []


def list_valid_sessions():
    supabase = get_supabase_client()
    response = (
        supabase.table("sessions")
        .select("*")
        .not_.is_("annotated_video_path", "null")
        .order("id")
        .execute()
    )
    return response.data or []


def get_session_by_id(session_id: int):
    supabase = get_supabase_client()
    response = (
        supabase.table("sessions")
        .select("*")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    data = response.data or []
    return data[0] if data else None


def get_behavior_events_by_session_id(session_id: int):
    supabase = get_supabase_client()
    response = (
        supabase.table("behavior_events")
        .select("label")
        .eq("session_id", session_id)
        .execute()
    )
    return response.data or []


def get_behavior_event_rows_for_windows(session_id: int):
    supabase = get_supabase_client()
    response = (
        supabase.table("behavior_events")
        .select("time_sec,target_id,label")
        .eq("session_id", session_id)
        .order("time_sec")
        .execute()
    )
    return response.data or []


def get_behavior_segments_by_session_id(session_id: int):
    supabase = get_supabase_client()
    response = (
        supabase.table("behavior_segments")
        .select("*")
        .eq("session_id", session_id)
        .order("start_time_sec")
        .execute()
    )
    return response.data or []


def get_telegram_logs_by_session_id(session_id: int):
    supabase = get_supabase_client()
    response = (
        supabase.table("telegram_logs")
        .select("*")
        .eq("session_id", session_id)
        .order("sent_at", desc=True)
        .execute()
    )
    return response.data or []


def insert_telegram_logs(rows: list[dict], chunk_size: int = 200):
    if not rows:
        return 0

    supabase = get_supabase_client()
    total = 0

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        supabase.table("telegram_logs").insert(chunk).execute()
        total += len(chunk)

    return total
