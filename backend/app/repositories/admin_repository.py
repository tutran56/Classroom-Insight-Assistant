from app.core.supabase_client import get_supabase_client


def delete_session_by_id(session_id: int):
    supabase = get_supabase_client()
    return (
        supabase.table("sessions")
        .delete()
        .eq("id", session_id)
        .execute()
    )
