import json
from typing import Any

from app.core.config import settings
from app.repositories.analytics_repository import (
    get_behavior_events_by_session_id,
    get_behavior_segments_by_session_id,
    get_session_by_id,
)


POSITIVE_LABELS = {"writing", "reading", "raising_hand"}
NEGATIVE_LABELS = {"using_phone", "sleeping", "turning"}
ALLOWED_SENTIMENTS = {"tich_cuc", "tuong_doi_on", "tieu_cuc", "rat_tieu_cuc"}


def _build_stats(session_id: int) -> dict[str, Any] | None:
    session = get_session_by_id(session_id)
    if not session:
        return None

    rows = get_behavior_events_by_session_id(session_id)
    segments = get_behavior_segments_by_session_id(session_id)

    label_counts: dict[str, int] = {}
    for row in rows:
        label = str(row.get("label", "")).strip()
        if not label:
            continue
        label_counts[label] = label_counts.get(label, 0) + 1

    total_events = sum(label_counts.values())
    positive_count = sum(label_counts.get(label, 0) for label in POSITIVE_LABELS)
    negative_count = sum(label_counts.get(label, 0) for label in NEGATIVE_LABELS)

    positive_ratio = round(positive_count / total_events, 4) if total_events > 0 else 0.0
    negative_ratio = round(negative_count / total_events, 4) if total_events > 0 else 0.0

    top_labels = sorted(label_counts.items(), key=lambda x: (-x[1], x[0]))[:5]

    return {
        "session_id": session_id,
        "class_name": session["class_name"],
        "total_events": total_events,
        "label_counts": label_counts,
        "positive_count": positive_count,
        "negative_count": negative_count,
        "positive_ratio": positive_ratio,
        "negative_ratio": negative_ratio,
        "phone_segment_count": len(segments),
        "top_labels": [{"label": label, "count": count} for label, count in top_labels],
    }


def _build_prompt(stats: dict[str, Any]) -> str:
    return f"""
Bạn là trợ lý phân tích hành vi lớp học.

Hãy đọc số liệu dưới đây và trả về đúng JSON, không thêm markdown, không thêm giải thích ngoài JSON.

Yêu cầu:
- Viết bằng tiếng Việt.
- overall_sentiment chỉ được là một trong 4 giá trị:
  \"tich_cuc\", \"tuong_doi_on\", \"tieu_cuc\", \"rat_tieu_cuc\"
- summary_text: 1 đoạn ngắn 2-4 câu.
- highlights: mảng 2-4 ý ngắn.
- suggestion: 1 câu gợi ý cải thiện, nếu lớp khá ổn thì vẫn viết gợi ý nhẹ.

Dữ liệu lớp học:
{json.dumps(stats, ensure_ascii=False, indent=2)}

Hãy trả đúng JSON theo schema:
{{
  \"overall_sentiment\": \"tich_cuc|tuong_doi_on|tieu_cuc|rat_tieu_cuc\",
  \"summary_text\": \"string\",
  \"highlights\": [\"string\", \"string\"],
  \"suggestion\": \"string\"
}}
""".strip()


def _rule_based_commentary(
    session_id: int,
    class_name: str,
    stats: dict[str, Any],
    reason: str | None = None,
) -> dict[str, Any]:
    label_counts = stats.get("label_counts", {})
    total_events = int(stats.get("total_events", 0))
    positive_ratio = float(stats.get("positive_ratio", 0.0))
    negative_ratio = float(stats.get("negative_ratio", 0.0))
    phone_segment_count = int(stats.get("phone_segment_count", 0))

    using_phone = int(label_counts.get("using_phone", 0))
    sleeping = int(label_counts.get("sleeping", 0))
    turning = int(label_counts.get("turning", 0))
    writing = int(label_counts.get("writing", 0))
    reading = int(label_counts.get("reading", 0))
    raising_hand = int(label_counts.get("raising_hand", 0))

    if negative_ratio >= 0.7:
        overall = "rat_tieu_cuc"
    elif negative_ratio >= 0.55:
        overall = "tieu_cuc"
    elif negative_ratio >= 0.4:
        overall = "tuong_doi_on"
    else:
        overall = "tich_cuc"

    summary_parts: list[str] = []

    if overall == "rat_tieu_cuc":
        summary_parts.append("Lớp học đang ở mức khá tiêu cực vì các hành vi mất tập trung chiếm tỷ lệ rất cao.")
    elif overall == "tieu_cuc":
        summary_parts.append("Lớp học có xu hướng tiêu cực vì nhóm hành vi mất tập trung đang nhỉnh hơn nhóm hành vi tích cực.")
    elif overall == "tuong_doi_on":
        summary_parts.append("Lớp học ở mức tương đối ổn, nhưng vẫn còn dấu hiệu mất tập trung ở một số thời điểm.")
    else:
        summary_parts.append("Lớp học có xu hướng tích cực vì các hành vi học tập chiếm tỷ trọng tốt hơn nhóm hành vi tiêu cực.")

    if using_phone > 0:
        summary_parts.append(
            f"Hành vi dùng điện thoại xuất hiện {using_phone} lần trong dữ liệu sự kiện và tạo ra {phone_segment_count} segment cảnh báo."
        )
    if sleeping > 0:
        summary_parts.append(f"Ngoài ra còn ghi nhận {sleeping} lần ngủ gật, cho thấy mức độ chú ý chưa ổn định.")
    if writing + reading + raising_hand > 0:
        summary_parts.append(
            f"Các hành vi tích cực như writing, reading, raising_hand hiện có tổng cộng {writing + reading + raising_hand} lần."
        )

    summary_text = " ".join(summary_parts[:3])

    highlights = [
        f"Tổng số sự kiện hành vi: {total_events}.",
        f"Tỷ lệ tích cực: {round(positive_ratio * 100, 1)}%, tỷ lệ tiêu cực: {round(negative_ratio * 100, 1)}%.",
    ]
    if using_phone > 0:
        highlights.append(f"using_phone là tín hiệu nổi bật với {using_phone} lần ghi nhận.")
    if sleeping > 0:
        highlights.append(f"sleeping xuất hiện {sleeping} lần.")
    elif turning > 0:
        highlights.append(f"turning xuất hiện {turning} lần, cho thấy có dao động chú ý trong lớp.")

    result = {
        "session_id": session_id,
        "class_name": class_name,
        "overall_sentiment": overall,
        "summary_text": summary_text,
        "highlights": highlights[:4],
        "suggestion": (
            "Nên ưu tiên nhắc nhở các thời điểm có using_phone hoặc sleeping cao, đồng thời tăng hoạt động tương tác để kéo sự tập trung của lớp."
            if overall in {"tieu_cuc", "rat_tieu_cuc"}
            else "Nên tiếp tục theo dõi các mốc thời gian có dấu hiệu mất tập trung và bổ sung thêm hoạt động tương tác ngắn để giữ nhịp lớp."
            if overall == "tuong_doi_on"
            else "Nên duy trì cách tổ chức lớp hiện tại và vẫn theo dõi các thời điểm có using_phone để ngăn mất tập trung cục bộ."
        ),
        "input_stats": stats,
    }

    if reason:
        result["fallback_reason"] = reason

    return result


def _load_genai_client(api_key: str):
    try:
        from google import genai  # lazy import to avoid crashing app at startup
    except Exception as exc:
        return None, f"google_genai_import_error: {exc}"

    try:
        return genai.Client(api_key=api_key), None
    except Exception as exc:
        return None, f"google_genai_client_error: {exc}"


def _parse_model_response(raw_text: str) -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("Gemini không trả về nội dung.")

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Gemini trả về JSON không hợp lệ.")
    return parsed


def get_ai_commentary(session_id: int) -> dict[str, Any] | None:
    session = get_session_by_id(session_id)
    if not session:
        return None

    stats = _build_stats(session_id)
    if stats is None:
        return None

    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        return _rule_based_commentary(
            session_id=session_id,
            class_name=session["class_name"],
            stats=stats,
            reason="missing_gemini_api_key",
        )

    client, client_error = _load_genai_client(api_key)
    if client is None:
        return _rule_based_commentary(
            session_id=session_id,
            class_name=session["class_name"],
            stats=stats,
            reason=client_error,
        )

    try:
        prompt = _build_prompt(stats)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        parsed = _parse_model_response(getattr(response, "text", ""))

        overall_sentiment = str(parsed.get("overall_sentiment", "tuong_doi_on")).strip()
        summary_text = str(parsed.get("summary_text", "")).strip()
        suggestion = str(parsed.get("suggestion", "")).strip()

        highlights = parsed.get("highlights", [])
        if not isinstance(highlights, list):
            highlights = []
        highlights = [str(item).strip() for item in highlights if str(item).strip()]

        if overall_sentiment not in ALLOWED_SENTIMENTS:
            overall_sentiment = "tuong_doi_on"
        if not summary_text:
            summary_text = "Chưa có nhận xét đủ rõ từ mô hình."
        if not suggestion:
            suggestion = "Nên tiếp tục theo dõi thêm các hành vi trong lớp để có đánh giá ổn định hơn."

        return {
            "session_id": session_id,
            "class_name": session["class_name"],
            "overall_sentiment": overall_sentiment,
            "summary_text": summary_text,
            "highlights": highlights[:4],
            "suggestion": suggestion,
            "input_stats": stats,
        }
    except Exception as exc:
        return _rule_based_commentary(
            session_id=session_id,
            class_name=session["class_name"],
            stats=stats,
            reason=f"gemini_error: {exc}",
        )