"use client";

import { useRef } from "react";
import SessionPromptSearch from "@/components/session-prompt-search";
import { getClipUrl, type TelegramLogItem } from "@/lib/api";

type KeyWindowCard = {
  title: string;
  startSec?: number | null;
  endSec?: number | null;
  description?: string;
  badge?: string;
};

type ClipItem = {
  target_id?: number | null;
  label?: string | null;
  start_sec?: number | null;
  end_sec?: number | null;
  duration_sec?: number | null;
  clip_file?: string | null;
  clip_path?: string | null;
  clip_url?: string | null;
};

type PhoneSegmentItem = {
  target_id?: number | null;
  label?: string | null;
  start_sec?: number | null;
  end_sec?: number | null;
  duration_sec?: number | null;
  peak_conf?: number | null;
  avg_conf?: number | null;
  clip_file?: string | null;
  clip_path?: string | null;
  clip_url?: string | null;
};

type Props = {
  sessionId: number;
  sessionKey: string;
  annotatedVideoUrl: string;
  overallSentiment?: string | null;
  totalEvents?: number | null;
  telegramTotal?: number | null;
  keyWindows?: KeyWindowCard[];
  clips?: ClipItem[];
  phoneSegments?: PhoneSegmentItem[];
};

function formatTime(sec?: number | null) {
  if (sec == null || Number.isNaN(sec)) return "-";

  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;

  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatNumber(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "-";
  return Number(value).toFixed(digits);
}

function labelToDisplay(label?: string | null) {
  if (!label) return "-";
  return label.replaceAll("_", " ");
}

export default function SessionAnalysisVideoPanel({
  sessionId,
  sessionKey,
  annotatedVideoUrl,
  overallSentiment,
  totalEvents,
  telegramTotal,
  keyWindows = [],
  clips = [],
  phoneSegments = [],
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function handleSeek(timeSec: number) {
    if (!videoRef.current || Number.isNaN(timeSec)) return;

    videoRef.current.currentTime = Math.max(0, timeSec);

    try {
      void videoRef.current.play();
    } catch {
      // ignore autoplay rejection
    }

    try {
      videoRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } catch {
      // ignore
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Annotated Video
          </h2>

          {annotatedVideoUrl ? (
            <a
              href={annotatedVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Open video in new tab
            </a>
          ) : null}
        </div>

        <div className="mt-4">
          {annotatedVideoUrl ? (
            <video
              ref={videoRef}
              key={annotatedVideoUrl}
              src={annotatedVideoUrl}
              controls
              preload="metadata"
              playsInline
              className="w-full rounded-2xl border bg-black"
            />
          ) : (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">
              Chưa có annotated video.
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Overall sentiment
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {overallSentiment || "-"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total events
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {totalEvents ?? "-"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Telegram logs
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {telegramTotal ?? 0}
            </div>
          </div>
        </div>
      </div>

      {keyWindows.length > 0 ? (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              Quick Jump Windows
            </h3>
            <div className="text-sm text-slate-500">
              Jump nhanh vào các đoạn nổi bật
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {keyWindows.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {item.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatTime(item.startSec)} - {formatTime(item.endSec)}
                    </div>
                  </div>

                  {item.badge ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {item.badge}
                    </span>
                  ) : null}
                </div>

                {item.description ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                ) : null}

                {typeof item.startSec === "number" ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => handleSeek(item.startSec as number)}
                      className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white"
                    >
                      Jump tới đoạn này
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SessionPromptSearch
        sessionId={sessionId}
        sessionKey={sessionKey}
        onSeek={handleSeek}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              Phone Segments
            </h3>
            <div className="text-sm text-slate-500">
              {phoneSegments.length} segment
            </div>
          </div>

          {phoneSegments.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-sm text-slate-500">
              Chưa có phone segments.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {phoneSegments.slice(0, 8).map((seg, idx) => (
                <div key={`${seg.target_id ?? "x"}-${seg.start_sec ?? idx}`} className="rounded-2xl border bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-900">
                    {labelToDisplay(seg.label)} • Target {seg.target_id ?? "-"}
                  </div>

                  <div className="mt-1 text-slate-600">
                    Time: {formatTime(seg.start_sec)} - {formatTime(seg.end_sec)}
                  </div>

                  <div className="mt-1 text-slate-600">
                    Duration: {formatNumber(seg.duration_sec)}s • Peak: {formatNumber(seg.peak_conf, 3)}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {typeof seg.start_sec === "number" ? (
                      <button
                        type="button"
                        onClick={() => handleSeek(seg.start_sec as number)}
                        className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Jump video
                      </button>
                    ) : null}

                    {getClipUrl({
                      clip_url: seg.clip_url,
                      clip_path: seg.clip_path,
                    }) ? (
                      <a
                        href={getClipUrl({
                          clip_url: seg.clip_url,
                          clip_path: seg.clip_path,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Open clip
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              Clips
            </h3>
            <div className="text-sm text-slate-500">
              {clips.length} clip
            </div>
          </div>

          {clips.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-sm text-slate-500">
              Chưa có clips.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {clips.slice(0, 6).map((clip, idx) => {
                const clipUrl = getClipUrl({
                  clip_url: clip.clip_url,
                  clip_path: clip.clip_path,
                });

                return (
                  <div key={`${clip.clip_file ?? "clip"}-${idx}`} className="rounded-2xl border p-3">
                    <div className="mb-3 space-y-1 text-sm">
                      <div>
                        <b>Target:</b> {clip.target_id ?? "-"}
                      </div>
                      <div>
                        <b>Label:</b> {labelToDisplay(clip.label)}
                      </div>
                      <div>
                        <b>Time:</b> {formatTime(clip.start_sec)} - {formatTime(clip.end_sec)}
                      </div>
                    </div>

                    {clipUrl ? (
                      <>
                        <video
                          src={clipUrl}
                          controls
                          preload="metadata"
                          playsInline
                          className="w-full rounded-xl border bg-black"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          {typeof clip.start_sec === "number" ? (
                            <button
                              type="button"
                              onClick={() => handleSeek(clip.start_sec as number)}
                              className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Jump video
                            </button>
                          ) : null}

                          <a
                            href={clipUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Open clip
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                        Không có clip URL
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
