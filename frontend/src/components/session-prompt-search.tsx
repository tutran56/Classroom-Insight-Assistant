"use client";

import { useMemo, useState } from "react";
import { searchSessionByPrompt } from "@/lib/api";

type PromptMatch = {
  type?: string;
  label?: string;
  target_id?: number;
  time_sec?: number;
  frame?: number;
  conf?: number;
  alpha?: number;
  start_time_sec?: number;
  end_time_sec?: number;
  duration_sec?: number;
  clip_path?: string | null;
  telegram_ready?: boolean;
};

type PromptSearchResult = {
  query_type?: string;
  answer?: string;
  seek_time_sec?: number | null;
  window_start_sec?: number | null;
  window_end_sec?: number | null;
  class_name?: string | null;
  session_key?: string | null;
  prompt?: string | null;
  behavior?: string | null;
  target_id?: number | null;
  count?: number | null;
  score?: number | null;
  recommended_clip_path?: string | null;
  recommended_segment?: PromptMatch | null;
  matches?: PromptMatch[];
  breakdown?: Record<string, number>;
};

type Props = {
  sessionId: number;
  onSeek?: (timeSec: number) => void;
  onSendTelegram?: (result: PromptSearchResult) => void;
};

const SUGGESTIONS = [
  "đoạn nào lớp tiêu cực nhất?",
  "đoạn nào dùng điện thoại nhiều nhất?",
  "có ai ngủ không?",
  "target nào turning nhiều nhất?",
  "đoạn nào nên gửi giáo viên?",
];

function formatSec(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return "-";
  }
  return `${Math.floor(value)}s`;
}

function labelQueryType(queryType?: string) {
  switch (queryType) {
    case "top_negative_window":
      return "Đoạn tiêu cực nhất";
    case "top_phone_window":
      return "Đoạn dùng điện thoại nổi bật";
    case "sleep_check":
      return "Kiểm tra ngủ gật";
    case "top_turning_target":
      return "Target turning nhiều nhất";
    case "top_target_behavior":
      return "Target nổi bật theo hành vi";
    case "telegram_candidate_window":
      return "Đoạn nên gửi giáo viên";
    case "fallback_negative_window":
      return "Kết quả fallback";
    default:
      return queryType || "Không xác định";
  }
}

function renderMatchTime(item: PromptMatch) {
  if (typeof item.time_sec === "number") {
    return `time=${formatSec(item.time_sec)}`;
  }
  if (
    typeof item.start_time_sec === "number" ||
    typeof item.end_time_sec === "number"
  ) {
    return `${formatSec(item.start_time_sec)} → ${formatSec(item.end_time_sec)}`;
  }
  return "Không có thời gian";
}

export default function SessionPromptSearch({
  sessionId,
  onSeek,
  onSendTelegram,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PromptSearchResult | null>(null);

  const matches = useMemo(() => result?.matches ?? [], [result]);

  async function handleSearch(submittedPrompt?: string) {
    const finalPrompt = (submittedPrompt ?? prompt).trim();
    if (!finalPrompt) {
      setError("Bạn cần nhập prompt trước khi tìm.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = (await searchSessionByPrompt(
        sessionId,
        finalPrompt
      )) as PromptSearchResult;
      setResult(data);

      if (typeof data.seek_time_sec === "number" && onSeek) {
        onSeek(data.seek_time_sec);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tìm kiếm được prompt.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickSuggestion(value: string) {
    setPrompt(value);
    void handleSearch(value);
  }

  function handleSeek() {
    if (typeof result?.seek_time_sec === "number" && onSeek) {
      onSeek(result.seek_time_sec);
    }
  }

  function handleSendTelegram() {
    if (result && onSendTelegram) {
      onSendTelegram(result);
    }
  }

  const canSeek = typeof result?.seek_time_sec === "number";
  const canSendTelegram =
    !!onSendTelegram &&
    !!result &&
    typeof result.window_start_sec === "number" &&
    typeof result.window_end_sec === "number";

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">PROMPT SEARCH</h2>
          <p className="mt-1 text-sm text-slate-500">
            Hỏi tự do để tìm đoạn cần xem, rồi jump video tới đúng thời điểm.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="Ví dụ: đoạn nào lớp tiêu cực nhất?"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:border-[#1f4f95]"
        />

        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading}
          className="rounded-xl bg-[#1f4f95] px-4 py-3 text-sm font-medium text-white hover:bg-[#173d73] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Đang tìm..." : "Tìm"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleQuickSuggestion(item)}
            disabled={loading}
            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {item}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Loại truy vấn
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {labelQueryType(result.query_type)}
                </div>

                <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trả lời
                </div>
                <div className="text-sm leading-6 text-slate-800">
                  {result.answer || "Chưa có câu trả lời."}
                </div>
              </div>

              <div className="grid min-w-[220px] grid-cols-1 gap-2 text-sm text-slate-700">
                <div className="rounded-xl bg-white px-3 py-2">
                  <span className="text-slate-500">Seek:</span>{" "}
                  <b>{formatSec(result.seek_time_sec)}</b>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <span className="text-slate-500">Window:</span>{" "}
                  <b>
                    {formatSec(result.window_start_sec)} →{" "}
                    {formatSec(result.window_end_sec)}
                  </b>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <span className="text-slate-500">Session:</span>{" "}
                  <b>{result.session_key || "-"}</b>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                  <span className="text-slate-500">Class:</span>{" "}
                  <b>{result.class_name || "-"}</b>
                </div>
              </div>
            </div>

            {result.breakdown && Object.keys(result.breakdown).length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Breakdown
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.breakdown).map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSeek}
                disabled={!canSeek}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Tới đoạn này
              </button>

              {canSendTelegram ? (
                <button
                  type="button"
                  onClick={handleSendTelegram}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Gửi Telegram
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">
              Matches ({matches.length})
            </div>

            {matches.length === 0 ? (
              <div className="text-sm text-slate-500">Không có match chi tiết.</div>
            ) : (
              <div className="space-y-3">
                {matches.map((item, index) => (
                  <div
                    key={`${item.type || "match"}-${index}`}
                    className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
                  >
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <div>
                        <span className="text-slate-500">type:</span>{" "}
                        <b>{item.type || "-"}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">label:</span>{" "}
                        <b>{item.label || "-"}</b>
                      </div>
                      <div>
                        <span className="text-slate-500">target:</span>{" "}
                        <b>
                          {typeof item.target_id === "number"
                            ? item.target_id
                            : "-"}
                        </b>
                      </div>
                      <div>
                        <span className="text-slate-500">time:</span>{" "}
                        <b>{renderMatchTime(item)}</b>
                      </div>
                    </div>

                    {(typeof item.conf === "number" ||
                      typeof item.alpha === "number" ||
                      typeof item.frame === "number") && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        {typeof item.frame === "number" ? (
                          <div>frame: {item.frame}</div>
                        ) : null}
                        {typeof item.conf === "number" ? (
                          <div>conf: {item.conf.toFixed(3)}</div>
                        ) : null}
                        {typeof item.alpha === "number" ? (
                          <div>alpha: {item.alpha.toFixed(3)}</div>
                        ) : null}
                      </div>
                    )}

                    {(typeof item.duration_sec === "number" ||
                      item.clip_path ||
                      typeof item.telegram_ready === "boolean") && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        {typeof item.duration_sec === "number" ? (
                          <div>duration: {formatSec(item.duration_sec)}</div>
                        ) : null}
                        {item.clip_path ? <div>clip: {item.clip_path}</div> : null}
                        {typeof item.telegram_ready === "boolean" ? (
                          <div>
                            telegram_ready: {item.telegram_ready ? "true" : "false"}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.recommended_segment ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Gợi ý gửi giáo viên
              </div>
              <div className="mt-2 text-sm text-slate-700">
                Window: <b>{formatSec(result.window_start_sec)}</b> →{" "}
                <b>{formatSec(result.window_end_sec)}</b>
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Clip: <b>{result.recommended_clip_path || "-"}</b>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}