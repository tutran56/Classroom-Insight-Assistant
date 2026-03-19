from app.core.supabase_client import get_supabase_client


def get_session_by_key(session_key: str):
    supabase = get_supabase_client()
    response = (
        supabase.table("sessions")
        .select("*")
        .eq("session_key", session_key)
        .limit(1)
        .execute()
    )
    data = response.data or []
    return data[0] if data else None


def create_session(payload: dict):
    supabase = get_supabase_client()
    response = supabase.table("sessions").insert(payload).execute()
    data = response.data or []
    return data[0] if data else None


def update_session(session_id: int, payload: dict):
    supabase = get_supabase_client()
    response = (
        supabase.table("sessions")
        .update(payload)
        .eq("id", session_id)
        .execute()
    )
    data = response.data or []
    return data[0] if data else None
