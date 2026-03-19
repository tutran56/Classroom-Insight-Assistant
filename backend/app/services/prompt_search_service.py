from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Optional

from app.repositories.analytics_repository import (
    get_behavior_event_rows_for_windows,
    get_behavior_segments_by_session_id,
    get_session_by_id,
)

WINDOW_SECONDS = 5.0

ALL_BEHAVIORS = {
    "using_phone",
    "sleeping",
    "turning",
    "writing",
    "reading",
    "raising_hand",
}

NEGATIVE_LABELS = {"using_phone", "sleeping", "turning"}
POSITIVE_LABELS = {"writing", "reading", "raising_hand"}

NEGATIVE_WEIGHTS = {
    "using_phone": 3.0,
    "sleeping": 2.5,
    "turning": 1.0,
}

POSITIVE_WEIGHTS = {
    "raising_hand": 2.5,
    "writing": 1.5,
    "reading": 1.2,
}

CONCEPTS = {
    "distracted",
    "diligent",
    "positive",
    "negative",
}

CONCEPT_BEHAVIOR_WEIGHTS = {
    "distracted": {
        "using_phone": 3.0,
        "sleeping": 2.5,
        "turning": 1.5,
    },
    "diligent": {
        "writing": 2.0,
        "reading": 1.8,
        "raising_hand": 1.2,
    },
    "positive": {
        "raising_hand": 2.0,
        "writing": 1.5,
        "reading": 1.2,
    },
    "negative": {
        "using_phone": 3.0,
        "sleeping": 2.5,
        "turning": 1.0,
    },
}

TARGET_QUERY = "target_behavior_search"
WINDOW_QUERY = "window_behavior_search"
TARGET_CONCEPT_QUERY = "target_concept_search"
WINDOW_CONCEPT_QUERY = "window_concept_search"
TELEGRAM_QUERY = "telegram_candidate_window"
AMBIGUOUS_QUERY = "ambiguous_behavior_query"
NO_EVIDENCE_QUERY = "no_evidence"

BEHAVIOR_VI_LABEL = {
    "using_phone": "dùng điện thoại",
    "sleeping": "ngủ gật",
    "turning": "quay ngang / mất tập trung",
    "writing": "viết bài",
    "reading": "đọc",
    "raising_hand": "giơ tay",
}

CONCEPT_VI_LABEL = {
    "distracted": "mất tập trung",
    "diligent": "chăm chỉ",
    "positive": "tích cực",
    "negative": "tiêu cực",
}

SCOPE_TARGET = "target"
SCOPE_WINDOW = "window"
SCOPE_MIXED = "mixed"


@dataclass
class ParsedPrompt:
    raw_prompt: str
    normalized_text: str
    tokens: list[str]
    scope: str
    behavior: Optional[str]
    concept: Optional[str]
    polarity: Optional[str]
    query_type: Optional[str]
    confidence: float
    strict_behavior_requested: bool
    strict_concept_requested: bool
    needs_clarification: bool


def _replace_special_vietnamese_letters(text: str) -> str:
    return text.replace("đ", "d").replace("Đ", "D")


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def _normalize_prompt(text: str) -> str:
    raw = (text or "").strip()
    raw = _replace_special_vietnamese_letters(raw)
    raw = _strip_accents(raw.lower())
    raw = re.sub(r"[^a-z0-9\s_]", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


def _tokenize(normalized_text: str) -> list[str]:
    if not normalized_text:
        return []
    return [tok for tok in normalized_text.split(" ") if tok]


def _token_set(tokens: list[str]) -> set[str]:
    return set(tokens)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return float(int(value))
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value).strip())
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return int(value)
        return int(float(value))
    except Exception:
        return default


def _normalize_label(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalize_event_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": _safe_int(row.get("session_id"), 0),
        "frame": _safe_int(row.get("frame"), 0),
        "time_sec": _safe_float(row.get("time_sec"), -1.0),
        "target_id": _safe_int(row.get("target_id"), 0),
        "label": _normalize_label(row.get("label")),
        "conf": _safe_float(row.get("conf"), 0.0),
        "alpha": _safe_float(row.get("alpha"), 0.0),
    }


def _normalize_segment_row(row: dict[str, Any]) -> dict[str, Any]:
    start_time_sec = _safe_float(row.get("start_time_sec"), -1.0)
    end_time_sec = _safe_float(row.get("end_time_sec"), start_time_sec)
    return {
        "session_id": _safe_int(row.get("session_id"), 0),
        "segment_id": str(row.get("segment_id") or "").strip(),
        "target_id": _safe_int(row.get("target_id"), 0),
        "label": _normalize_label(row.get("label")),
        "start_time_sec": start_time_sec,
        "end_time_sec": max(end_time_sec, start_time_sec),
        "duration_sec": _safe_float(
            row.get("duration_sec"),
            max(end_time_sec - start_time_sec, 0.0),
        ),
        "peak_conf": _safe_float(row.get("peak_conf"), 0.0),
        "mean_conf": _safe_float(row.get("mean_conf"), 0.0),
        "clip_path": row.get("clip_path"),
        "telegram_ready": bool(row.get("telegram_ready")),
    }


def _bucket_start(time_sec: float, window_seconds: float = WINDOW_SECONDS) -> float:
    if time_sec < 0:
        return 0.0
    return math.floor(time_sec / window_seconds) * window_seconds


def _window_end(start_sec: float, window_seconds: float = WINDOW_SECONDS) -> float:
    return start_sec + window_seconds


def _format_window_text(start_sec: float, end_sec: float) -> str:
    return f"{int(start_sec)}s đến {int(end_sec)}s"


def _event_to_match(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "event",
        "label": row["label"],
        "target_id": row["target_id"],
        "time_sec": row["time_sec"],
        "frame": row["frame"],
        "conf": row["conf"],
        "alpha": row["alpha"],
    }


def _segment_to_match(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "segment",
        "label": row["label"],
        "target_id": row["target_id"],
        "start_time_sec": row["start_time_sec"],
        "end_time_sec": row["end_time_sec"],
        "duration_sec": row["duration_sec"],
        "clip_path": row["clip_path"],
        "telegram_ready": row["telegram_ready"],
    }


def _empty_result(
    query_type: str,
    answer: str,
    scope: str,
    behavior: Optional[str] = None,
    concept: Optional[str] = None,
    polarity: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "query_type": query_type,
        "scope": scope,
        "behavior": behavior,
        "concept": concept,
        "polarity": polarity,
        "answer": answer,
        "seek_time_sec": None,
        "window_start_sec": None,
        "window_end_sec": None,
        "target_ids": [],
        "target_summaries": [],
        "matches": [],
    }


def _has_token(tokens: list[str], token: str) -> bool:
    return token in _token_set(tokens)


def _has_any_token(tokens: list[str], keywords: set[str]) -> bool:
    token_lookup = _token_set(tokens)
    return any(keyword in token_lookup for keyword in keywords)


def _has_phrase(normalized_text: str, phrase: str) -> bool:
    if not phrase:
        return False
    escaped = re.escape(phrase.strip())
    pattern = rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])"
    return re.search(pattern, normalized_text) is not None


def _has_any_phrase(normalized_text: str, phrases: set[str]) -> bool:
    return any(_has_phrase(normalized_text, phrase) for phrase in phrases)


def _build_behavior_aliases() -> dict[str, dict[str, set[str]]]:
    return {
        "using_phone": {
            "tokens": {"phone", "mobile", "smartphone", "dt"},
            "phrases": {
                "dien thoai",
                "dung dien thoai",
                "su dung dien thoai",
                "cam dien thoai",
                "dung dt",
                "su dung dt",
            },
        },
        "sleeping": {
            "tokens": {"ngu", "guc", "sleep", "sleeping", "doze"},
            "phrases": {"ngu gat", "buon ngu", "guc ngu", "ngu guc"},
        },
        "turning": {
            "tokens": {"turning", "quay"},
            "phrases": {"quay ngang", "nhin ngang", "dao mat", "nghieng nguoi"},
        },
        "writing": {
            "tokens": {"viet", "writing", "note"},
            "phrases": {"viet bai", "ghi chep", "ghi bai"},
        },
        "reading": {
            "tokens": {"doc", "reading"},
            "phrases": {"doc bai", "xem sach", "xem tai lieu"},
        },
        "raising_hand": {
            "tokens": set(),
            "phrases": {"gio tay", "raising hand", "raise hand", "xin phat bieu"},
        },
    }


BEHAVIOR_ALIASES = _build_behavior_aliases()

TARGET_TOKENS = {
    "ai",
    "sinh",
    "vien",
    "hoc",
    "student",
    "target",
    "nguoi",
    "ban",
}
TARGET_PHRASES = {
    "sinh vien",
    "hoc sinh",
    "nguoi nao",
    "ban nao",
    "target nao",
    "nhung sinh vien nao",
    "nhung ban nao",
    "tim sinh vien",
    "tim hoc sinh",
}

WINDOW_TOKENS = {"doan", "khoang", "luc", "window", "seek", "jump"}
WINDOW_PHRASES = {
    "doan nao",
    "khoang nao",
    "luc nao",
    "thoi gian nao",
    "dua toi doan",
    "toi doan nay",
}

TEACHER_TOKENS = {"telegram", "alert", "warning"}
TEACHER_PHRASES = {
    "giao vien",
    "gui giao vien",
    "bao giao vien",
    "gui clip",
    "gui thong bao",
    "canh bao",
}

POSITIVE_TOKENS = {"positive", "active"}
POSITIVE_PHRASES = {"tich cuc", "tham gia tot", "hieu hoc", "cham chi"}

NEGATIVE_TOKENS = {"xau", "te"}
NEGATIVE_PHRASES = {
    "tieu cuc",
    "xau nhat",
    "te nhat",
    "dang lo",
    "mat tap trung",
    "khong tap trung",
    "can xu ly",
    "nen xu ly",
}

MIXED_PHRASES = {
    "vua tich cuc vua it tieu cuc",
    "it tieu cuc",
    "tham gia tot nhat",
    "tot nhung khong mat tap trung",
}

CONCEPT_ALIASES = {
    "distracted": {
        "tokens": set(),
        "phrases": {
            "mat tap trung",
            "khong tap trung",
            "xao nhang",
            "lo dang",
            "mat trung",
        },
    },
    "diligent": {
        "tokens": set(),
        "phrases": {
            "cham chi",
            "hoc tot",
            "tap trung hoc",
            "nghiem tuc",
        },
    },
    "positive": {
        "tokens": set(),
        "phrases": {
            "tich cuc",
            "tham gia tot",
            "chu dong",
        },
    },
    "negative": {
        "tokens": set(),
        "phrases": {
            "tieu cuc",
            "dang lo",
            "can chu y",
        },
    },
}


def _detect_behavior(normalized_text: str, tokens: list[str]) -> tuple[Optional[str], float]:
    scores: dict[str, float] = defaultdict(float)

    for behavior, alias_map in BEHAVIOR_ALIASES.items():
        token_hits = sum(1 for tok in alias_map["tokens"] if _has_token(tokens, tok))
        phrase_hits = sum(
            1 for phrase in alias_map["phrases"] if _has_phrase(normalized_text, phrase)
        )

        if token_hits > 0:
            scores[behavior] += token_hits * 1.5
        if phrase_hits > 0:
            scores[behavior] += phrase_hits * 3.0

    if not scores:
        return None, 0.0

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    best_behavior, best_score = ranked[0]

    if best_score <= 0:
        return None, 0.0

    if len(ranked) >= 2:
        second_score = ranked[1][1]
        if best_score - second_score < 0.75:
            return None, best_score

    return best_behavior, best_score


def _detect_concept(normalized_text: str, tokens: list[str]) -> tuple[Optional[str], float]:
    scores: dict[str, float] = defaultdict(float)

    for concept, alias_map in CONCEPT_ALIASES.items():
        token_hits = sum(1 for tok in alias_map["tokens"] if _has_token(tokens, tok))
        phrase_hits = sum(
            1 for phrase in alias_map["phrases"] if _has_phrase(normalized_text, phrase)
        )

        if token_hits > 0:
            scores[concept] += token_hits * 1.0
        if phrase_hits > 0:
            scores[concept] += phrase_hits * 2.5

    if not scores:
        return None, 0.0

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    best_concept, best_score = ranked[0]

    if best_score <= 0:
        return None, 0.0

    if len(ranked) >= 2:
        second_score = ranked[1][1]
        if best_score - second_score < 0.75:
            return None, best_score

    return best_concept, best_score


def _detect_scope(normalized_text: str, tokens: list[str], behavior: Optional[str], concept: Optional[str]) -> str:
    if _has_any_phrase(normalized_text, MIXED_PHRASES):
        return SCOPE_MIXED

    if _has_any_phrase(normalized_text, TEACHER_PHRASES) or _has_any_token(tokens, TEACHER_TOKENS):
        return SCOPE_MIXED

    target_score = 0.0
    window_score = 0.0

    if _has_any_phrase(normalized_text, TARGET_PHRASES):
        target_score += 3.0
    if _has_any_token(tokens, TARGET_TOKENS):
        target_score += 1.5

    if _has_any_phrase(normalized_text, WINDOW_PHRASES):
        window_score += 3.0
    if _has_any_token(tokens, WINDOW_TOKENS):
        window_score += 1.5

    if target_score > window_score:
        return SCOPE_TARGET
    if window_score > target_score:
        return SCOPE_WINDOW

    if behavior is not None or concept is not None:
        return SCOPE_TARGET

    return SCOPE_WINDOW


def _detect_polarity(
    normalized_text: str,
    tokens: list[str],
    behavior: Optional[str],
    concept: Optional[str],
) -> Optional[str]:
    if behavior in NEGATIVE_LABELS:
        return "negative"
    if behavior in POSITIVE_LABELS:
        return "positive"

    if concept == "distracted" or concept == "negative":
        return "negative"
    if concept == "diligent" or concept == "positive":
        return "positive"

    pos_score = 0.0
    neg_score = 0.0

    if _has_any_phrase(normalized_text, POSITIVE_PHRASES):
        pos_score += 2.5
    if _has_any_token(tokens, POSITIVE_TOKENS):
        pos_score += 1.0

    if _has_any_phrase(normalized_text, NEGATIVE_PHRASES):
        neg_score += 2.5
    if _has_any_token(tokens, NEGATIVE_TOKENS):
        neg_score += 1.0

    if pos_score > neg_score:
        return "positive"
    if neg_score > pos_score:
        return "negative"

    return None


def _parse_prompt(prompt: str) -> ParsedPrompt:
    normalized_text = _normalize_prompt(prompt)
    tokens = _tokenize(normalized_text)

    behavior, behavior_confidence = _detect_behavior(normalized_text, tokens)
    concept, concept_confidence = _detect_concept(normalized_text, tokens)
    scope = _detect_scope(normalized_text, tokens, behavior, concept)
    polarity = _detect_polarity(normalized_text, tokens, behavior, concept)

    query_type: Optional[str] = None
    needs_clarification = False

    strict_behavior_requested = behavior is not None
    strict_concept_requested = concept is not None

    if _has_any_phrase(normalized_text, TEACHER_PHRASES) or _has_any_token(tokens, TEACHER_TOKENS):
        query_type = TELEGRAM_QUERY
    elif _has_any_phrase(normalized_text, MIXED_PHRASES):
        query_type = MIXED_TARGET_QUERY
    elif scope == SCOPE_TARGET and behavior is None and concept is None:
        query_type = AMBIGUOUS_QUERY
        needs_clarification = True
    elif scope == SCOPE_WINDOW and behavior is None and concept is None and polarity is None:
        query_type = AMBIGUOUS_QUERY
        needs_clarification = True

    return ParsedPrompt(
        raw_prompt=prompt,
        normalized_text=normalized_text,
        tokens=tokens,
        scope=scope,
        behavior=behavior,
        concept=concept,
        polarity=polarity,
        query_type=query_type,
        confidence=max(behavior_confidence, concept_confidence),
        strict_behavior_requested=strict_behavior_requested,
        strict_concept_requested=strict_concept_requested,
        needs_clarification=needs_clarification,
    )


def _count_events_by_behavior(events: list[dict[str, Any]], behavior: str) -> int:
    return sum(1 for row in events if row["label"] == behavior)


def _count_events_by_concept(events: list[dict[str, Any]], concept: str) -> int:
    concept_weights = CONCEPT_BEHAVIOR_WEIGHTS.get(concept, {})
    return sum(1 for row in events if row["label"] in concept_weights)


def _no_evidence_result_for_behavior(scope: str, behavior: str) -> dict[str, Any]:
    return _empty_result(
        query_type=NO_EVIDENCE_QUERY,
        answer=f"Không phát hiện hành vi {BEHAVIOR_VI_LABEL.get(behavior, behavior)} trong session này.",
        scope=scope,
        behavior=behavior,
        concept=None,
        polarity="negative" if behavior in NEGATIVE_LABELS else "positive",
    )


def _no_evidence_result_for_concept(scope: str, concept: str) -> dict[str, Any]:
    return _empty_result(
        query_type=NO_EVIDENCE_QUERY,
        answer=f"Không phát hiện nhóm hành vi {CONCEPT_VI_LABEL.get(concept, concept)} trong session này.",
        scope=scope,
        behavior=None,
        concept=concept,
        polarity="negative" if concept in {"distracted", "negative"} else "positive",
    )


def _top_weighted_window(
    events: list[dict[str, Any]],
    allowed_labels: set[str],
    weights: dict[str, float],
) -> Optional[dict[str, Any]]:
    buckets: dict[float, dict[str, Any]] = {}

    for row in events:
        label = row["label"]
        if label not in allowed_labels:
            continue
        if row["time_sec"] < 0:
            continue

        start_sec = _bucket_start(row["time_sec"])
        bucket = buckets.setdefault(
            start_sec,
            {
                "score": 0.0,
                "start_sec": start_sec,
                "end_sec": _window_end(start_sec),
                "events": [],
                "breakdown": defaultdict(int),
                "targets": set(),
            },
        )
        bucket["score"] += weights.get(label, 1.0)
        bucket["events"].append(row)
        bucket["breakdown"][label] += 1
        bucket["targets"].add(row["target_id"])

    if not buckets:
        return None

    best = max(
        buckets.values(),
        key=lambda item: (
            item["score"],
            len(item["targets"]),
            len(item["events"]),
            -item["start_sec"],
        ),
    )

    best["breakdown"] = dict(best["breakdown"])
    best["target_ids"] = sorted(tid for tid in best["targets"] if tid > 0)
    best["events"] = sorted(
        best["events"],
        key=lambda row: (row["time_sec"], row["target_id"]),
    )[:30]
    return best


def _build_window_answer(
    behavior: Optional[str],
    concept: Optional[str],
    polarity: Optional[str],
    start_sec: float,
    end_sec: float,
) -> str:
    if behavior:
        return (
            f"Đoạn nổi bật nhất cho hành vi {BEHAVIOR_VI_LABEL.get(behavior, behavior)} "
            f"nằm trong khoảng {_format_window_text(start_sec, end_sec)}."
        )

    if concept:
        return (
            f"Đoạn nổi bật nhất cho nhóm hành vi {CONCEPT_VI_LABEL.get(concept, concept)} "
            f"nằm trong khoảng {_format_window_text(start_sec, end_sec)}."
        )

    if polarity == "positive":
        return f"Đoạn tích cực nổi bật nhất nằm trong khoảng {_format_window_text(start_sec, end_sec)}."

    return f"Đoạn tiêu cực nổi bật nhất nằm trong khoảng {_format_window_text(start_sec, end_sec)}."


def _window_query_by_behavior(
    events: list[dict[str, Any]],
    behavior: str,
) -> dict[str, Any]:
    weights = {
        behavior: (
            NEGATIVE_WEIGHTS.get(behavior)
            if behavior in NEGATIVE_WEIGHTS
            else POSITIVE_WEIGHTS.get(behavior, 1.0)
        )
    }

    best_window = _top_weighted_window(events, {behavior}, weights)
    if not best_window:
        return _no_evidence_result_for_behavior(SCOPE_WINDOW, behavior)

    return {
        "query_type": WINDOW_QUERY,
        "scope": SCOPE_WINDOW,
        "behavior": behavior,
        "concept": None,
        "polarity": "negative" if behavior in NEGATIVE_LABELS else "positive",
        "answer": _build_window_answer(
            behavior=behavior,
            concept=None,
            polarity=None,
            start_sec=best_window["start_sec"],
            end_sec=best_window["end_sec"],
        ),
        "seek_time_sec": best_window["start_sec"],
        "window_start_sec": best_window["start_sec"],
        "window_end_sec": best_window["end_sec"],
        "target_ids": best_window["target_ids"],
        "target_summaries": [],
        "breakdown": best_window["breakdown"],
        "score": round(best_window["score"], 3),
        "matches": [_event_to_match(row) for row in best_window["events"]],
    }


def _window_query_by_concept(
    events: list[dict[str, Any]],
    concept: str,
) -> dict[str, Any]:
    concept_weights = CONCEPT_BEHAVIOR_WEIGHTS[concept]
    allowed_labels = set(concept_weights.keys())

    best_window = _top_weighted_window(events, allowed_labels, concept_weights)
    if not best_window:
        return _no_evidence_result_for_concept(SCOPE_WINDOW, concept)

    return {
        "query_type": WINDOW_CONCEPT_QUERY,
        "scope": SCOPE_WINDOW,
        "behavior": None,
        "concept": concept,
        "polarity": "negative" if concept in {"distracted", "negative"} else "positive",
        "answer": _build_window_answer(
            behavior=None,
            concept=concept,
            polarity=None,
            start_sec=best_window["start_sec"],
            end_sec=best_window["end_sec"],
        ),
        "seek_time_sec": best_window["start_sec"],
        "window_start_sec": best_window["start_sec"],
        "window_end_sec": best_window["end_sec"],
        "target_ids": best_window["target_ids"],
        "target_summaries": [],
        "breakdown": best_window["breakdown"],
        "score": round(best_window["score"], 3),
        "matches": [_event_to_match(row) for row in best_window["events"]],
    }


def _build_target_summary(
    target_id: int,
    rows: list[dict[str, Any]],
    behavior: Optional[str],
    concept: Optional[str],
) -> dict[str, Any]:
    ordered = sorted(rows, key=lambda row: row["time_sec"])
    first_time = ordered[0]["time_sec"]
    last_time = ordered[-1]["time_sec"]
    best_window_start = _bucket_start(first_time)
    best_window_end = _window_end(best_window_start)

    return {
        "target_id": target_id,
        "behavior": behavior,
        "concept": concept,
        "count": len(rows),
        "first_time_sec": first_time,
        "last_time_sec": last_time,
        "best_window_start_sec": best_window_start,
        "best_window_end_sec": best_window_end,
    }


def _target_query_for_behavior(
    events: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    behavior: str,
) -> dict[str, Any]:
    behavior_events = [
        row
        for row in events
        if row["label"] == behavior and row["time_sec"] >= 0 and row["target_id"] > 0
    ]

    if not behavior_events:
        return _no_evidence_result_for_behavior(SCOPE_TARGET, behavior)

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in behavior_events:
        grouped[row["target_id"]].append(row)

    ranked = sorted(
        grouped.items(),
        key=lambda item: (
            -len(item[1]),
            min(r["time_sec"] for r in item[1]),
            item[0],
        ),
    )

    top_target_id, top_rows = ranked[0]
    top_target_ids = [target_id for target_id, _ in ranked[:5]]

    target_summaries = [
        _build_target_summary(target_id, rows, behavior, None)
        for target_id, rows in ranked[:5]
    ]

    first_time = min(row["time_sec"] for row in top_rows)
    start_sec = _bucket_start(first_time)
    end_sec = _window_end(start_sec)

    related_matches = sorted(top_rows, key=lambda row: row["time_sec"])[:30]
    related_segments = [
        seg
        for seg in segments
        if seg["label"] == behavior and seg["target_id"] in top_target_ids
    ][:10]

    answer = (
        f"Các sinh viên có hành vi {BEHAVIOR_VI_LABEL.get(behavior, behavior)} nổi bật là "
        f"{', '.join(f'target {tid}' for tid in top_target_ids)}. "
        f"Target đứng đầu là {top_target_id} với {len(top_rows)} lần ghi nhận."
    )

    matches = [_event_to_match(row) for row in related_matches]
    matches.extend(_segment_to_match(seg) for seg in related_segments)

    return {
        "query_type": TARGET_QUERY,
        "scope": SCOPE_TARGET,
        "behavior": behavior,
        "concept": None,
        "polarity": "negative" if behavior in NEGATIVE_LABELS else "positive",
        "answer": answer,
        "seek_time_sec": start_sec,
        "window_start_sec": start_sec,
        "window_end_sec": end_sec,
        "target_id": top_target_id,
        "target_ids": top_target_ids,
        "target_summaries": target_summaries,
        "count": len(top_rows),
        "matches": matches,
    }


def _target_query_for_concept(
    events: list[dict[str, Any]],
    concept: str,
) -> dict[str, Any]:
    concept_weights = CONCEPT_BEHAVIOR_WEIGHTS[concept]
    concept_labels = set(concept_weights.keys())

    grouped: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "score": 0.0,
            "rows": [],
            "breakdown": defaultdict(int),
            "latest_time": -1.0,
        }
    )

    for row in events:
        target_id = row["target_id"]
        label = row["label"]
        if target_id <= 0:
            continue
        if label not in concept_labels:
            continue

        grouped[target_id]["score"] += concept_weights.get(label, 1.0)
        grouped[target_id]["rows"].append(row)
        grouped[target_id]["breakdown"][label] += 1
        grouped[target_id]["latest_time"] = max(
            grouped[target_id]["latest_time"],
            row["time_sec"],
        )

    candidates = [(target_id, data) for target_id, data in grouped.items() if data["rows"]]
    if not candidates:
        return _no_evidence_result_for_concept(SCOPE_TARGET, concept)

    ranked = sorted(
        candidates,
        key=lambda item: (
            -item[1]["score"],
            -len(item[1]["rows"]),
            item[0],
        ),
    )

    top_target_id, top_data = ranked[0]
    top_target_ids = [target_id for target_id, _ in ranked[:5]]

    target_summaries = []
    for target_id, data in ranked[:5]:
        rows = sorted(data["rows"], key=lambda row: row["time_sec"])
        first_time = rows[0]["time_sec"]
        target_summaries.append(
            {
                "target_id": target_id,
                "concept": concept,
                "score": round(data["score"], 3),
                "count": len(rows),
                "breakdown": dict(data["breakdown"]),
                "best_window_start_sec": _bucket_start(first_time),
                "best_window_end_sec": _window_end(_bucket_start(first_time)),
            }
        )

    top_rows = sorted(top_data["rows"], key=lambda row: row["time_sec"])
    first_time = top_rows[0]["time_sec"]
    start_sec = _bucket_start(first_time)
    end_sec = _window_end(start_sec)

    return {
        "query_type": TARGET_CONCEPT_QUERY,
        "scope": SCOPE_TARGET,
        "behavior": None,
        "concept": concept,
        "polarity": "negative" if concept in {"distracted", "negative"} else "positive",
        "answer": (
            f"Target {top_target_id} là sinh viên nổi bật nhất theo tiêu chí "
            f"{CONCEPT_VI_LABEL.get(concept, concept)}."
        ),
        "seek_time_sec": start_sec,
        "window_start_sec": start_sec,
        "window_end_sec": end_sec,
        "target_id": top_target_id,
        "target_ids": top_target_ids,
        "target_summaries": target_summaries,
        "matches": [_event_to_match(row) for row in top_rows[:30]],
    }


def _telegram_candidate_window(
    events: list[dict[str, Any]],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    best_window = _top_weighted_window(
        events=events,
        allowed_labels=NEGATIVE_LABELS,
        weights=NEGATIVE_WEIGHTS,
    )

    if not best_window:
        return _empty_result(
            query_type=NO_EVIDENCE_QUERY,
            answer="Không tìm thấy đoạn đủ mạnh để gửi giáo viên.",
            scope=SCOPE_MIXED,
            behavior=None,
            concept=None,
            polarity="negative",
        )

    result = {
        "query_type": TELEGRAM_QUERY,
        "scope": SCOPE_MIXED,
        "behavior": None,
        "concept": "negative",
        "polarity": "negative",
        "answer": (
            f"Đoạn nên gửi giáo viên nằm trong khoảng "
            f"{_format_window_text(best_window['start_sec'], best_window['end_sec'])}."
        ),
        "seek_time_sec": best_window["start_sec"],
        "window_start_sec": best_window["start_sec"],
        "window_end_sec": best_window["end_sec"],
        "target_ids": best_window["target_ids"],
        "target_summaries": [],
        "breakdown": best_window["breakdown"],
        "score": round(best_window["score"], 3),
        "matches": [_event_to_match(row) for row in best_window["events"]],
    }

    overlapping_segments = [
        seg
        for seg in segments
        if seg["label"] == "using_phone"
        and seg["start_time_sec"] <= best_window["end_sec"]
        and seg["end_time_sec"] >= best_window["start_sec"]
    ]
    if overlapping_segments:
        best_seg = max(
            overlapping_segments,
            key=lambda row: (row["duration_sec"], row["peak_conf"]),
        )
        result["recommended_clip_path"] = best_seg.get("clip_path")
        result["recommended_segment"] = _segment_to_match(best_seg)

    return result


def _clarification_result(parsed: ParsedPrompt) -> dict[str, Any]:
    if parsed.scope == SCOPE_TARGET:
        return _empty_result(
            query_type=AMBIGUOUS_QUERY,
            answer=(
                "Tôi hiểu bạn đang muốn tìm theo sinh viên/target, nhưng chưa xác định rõ hành vi hoặc nhóm hành vi. "
                "Bạn có thể hỏi rõ hơn như: dùng điện thoại, ngủ gật, turning, viết bài, đọc, giơ tay, mất tập trung, chăm chỉ."
            ),
            scope=SCOPE_TARGET,
            behavior=None,
            concept=None,
            polarity=parsed.polarity,
        )

    return _empty_result(
        query_type=AMBIGUOUS_QUERY,
        answer=(
            "Tôi chưa xác định rõ hành vi hoặc nhóm hành vi bạn muốn tìm. "
            "Bạn có thể hỏi rõ hơn như: đoạn nào dùng điện thoại nhiều nhất, đoạn nào tích cực nhất, "
            "hoặc những sinh viên nào giơ tay nhiều nhất."
        ),
        scope=parsed.scope,
        behavior=None,
        concept=None,
        polarity=parsed.polarity,
    )


def search_session_by_prompt(session_id: int, prompt: str) -> dict[str, Any]:
    session = get_session_by_id(session_id)
    if not session:
        return {
            "query_type": "not_found",
            "scope": None,
            "behavior": None,
            "concept": None,
            "polarity": None,
            "answer": "Không tìm thấy session.",
            "seek_time_sec": None,
            "window_start_sec": None,
            "window_end_sec": None,
            "target_ids": [],
            "target_summaries": [],
            "matches": [],
        }

    normalized_events = [
        _normalize_event_row(row)
        for row in (get_behavior_event_rows_for_windows(session_id) or [])
    ]
    normalized_events = [
        row
        for row in normalized_events
        if row["label"] in ALL_BEHAVIORS and row["time_sec"] >= 0
    ]

    normalized_segments = [
        _normalize_segment_row(row)
        for row in (get_behavior_segments_by_session_id(session_id) or [])
    ]
    normalized_segments = [
        row
        for row in normalized_segments
        if row["label"] in ALL_BEHAVIORS and row["start_time_sec"] >= 0
    ]

    parsed = _parse_prompt(prompt)

    # Nguyên tắc anti-hallucination:
    # 1) Nếu user hỏi behavior cụ thể mà session không có behavior đó -> trả KHÔNG PHÁT HIỆN
    # 2) Nếu user hỏi concept cụ thể mà session không có concept đó -> trả KHÔNG PHÁT HIỆN
    # 3) Không fallback sang behavior khác khi đã explicit.
    if parsed.strict_behavior_requested and parsed.behavior:
        evidence_count = _count_events_by_behavior(normalized_events, parsed.behavior)
        if evidence_count <= 0:
            result = _no_evidence_result_for_behavior(parsed.scope, parsed.behavior)
        elif parsed.query_type == TELEGRAM_QUERY:
            result = _telegram_candidate_window(normalized_events, normalized_segments)
        elif parsed.scope == SCOPE_TARGET:
            result = _target_query_for_behavior(
                normalized_events,
                normalized_segments,
                parsed.behavior,
            )
        elif parsed.scope == SCOPE_WINDOW:
            result = _window_query_by_behavior(normalized_events, parsed.behavior)
        else:
            result = _clarification_result(parsed)

    elif parsed.strict_concept_requested and parsed.concept:
        evidence_count = _count_events_by_concept(normalized_events, parsed.concept)
        if evidence_count <= 0:
            result = _no_evidence_result_for_concept(parsed.scope, parsed.concept)
        elif parsed.query_type == TELEGRAM_QUERY:
            result = _telegram_candidate_window(normalized_events, normalized_segments)
        elif parsed.scope == SCOPE_TARGET:
            result = _target_query_for_concept(normalized_events, parsed.concept)
        elif parsed.scope == SCOPE_WINDOW:
            result = _window_query_by_concept(normalized_events, parsed.concept)
        else:
            result = _clarification_result(parsed)

    elif parsed.query_type == TELEGRAM_QUERY:
        result = _telegram_candidate_window(normalized_events, normalized_segments)

    elif parsed.needs_clarification:
        result = _clarification_result(parsed)

    elif parsed.scope == SCOPE_TARGET and parsed.behavior is not None:
        result = _target_query_for_behavior(
            normalized_events,
            normalized_segments,
            parsed.behavior,
        )

    elif parsed.scope == SCOPE_WINDOW and parsed.behavior is not None:
        result = _window_query_by_behavior(normalized_events, parsed.behavior)

    elif parsed.scope == SCOPE_TARGET and parsed.concept is not None:
        result = _target_query_for_concept(normalized_events, parsed.concept)

    elif parsed.scope == SCOPE_WINDOW and parsed.concept is not None:
        result = _window_query_by_concept(normalized_events, parsed.concept)

    else:
        result = _clarification_result(parsed)

    result["session_id"] = session_id
    result["session_key"] = session.get("session_key")
    result["class_name"] = session.get("class_name")
    result["prompt"] = prompt
    result["parser_debug"] = {
        "normalized_text": parsed.normalized_text,
        "scope": parsed.scope,
        "behavior": parsed.behavior,
        "concept": parsed.concept,
        "polarity": parsed.polarity,
        "confidence": parsed.confidence,
        "strict_behavior_requested": parsed.strict_behavior_requested,
        "strict_concept_requested": parsed.strict_concept_requested,
        "needs_clarification": parsed.needs_clarification,
    }
    return result


def prompt_search(session_id: int, prompt: str) -> dict[str, Any]:
    return search_session_by_prompt(session_id, prompt)


def search_by_prompt(session_id: int, prompt: str) -> dict[str, Any]:
    return search_session_by_prompt(session_id, prompt)