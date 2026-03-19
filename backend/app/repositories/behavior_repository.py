from app.core.supabase_client import get_supabase_client


def delete_behavior_events_by_session_id(session_id: int):
    supabase = get_supabase_client()
    return (
        supabase.table("behavior_events")
        .delete()
        .eq("session_id", session_id)
        .execute()
    )


def delete_behavior_segments_by_session_id(session_id: int):
    supabase = get_supabase_client()
    return (
        supabase.table("behavior_segments")
        .delete()
        .eq("session_id", session_id)
        .execute()
    )


def insert_behavior_events(rows: list[dict], chunk_size: int = 500):
    if not rows:
        return 0

    supabase = get_supabase_client()
    total = 0

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        supabase.table("behavior_events").insert(chunk).execute()
        total += len(chunk)

    return total


def insert_behavior_segments(rows: list[dict], chunk_size: int = 500):
    if not rows:
        return 0

    supabase = get_supabase_client()
    total = 0

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        supabase.table("behavior_segments").insert(chunk).execute()
        total += len(chunk)

    return total
