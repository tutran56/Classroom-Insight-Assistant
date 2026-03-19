"use client";

import Link from "next/link";
import {
  getBestAnnotatedVideoUrl,
  getClipUrl,
  toBackendAssetUrl,
  type JobResultResponse,
} from "@/lib/api";

type Props = {
  result?: JobResultResponse | null;
};

function formatTime(sec?: number | null) {
  if (sec == null || Number.isNaN(sec)) return "-";

  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;

  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPercent(part: number, total: number) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

export default function JobResultDashboard({ result }: Props) {
  if (!result) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Latest Job Result</h2>
        <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
          Chưa có result. Hãy upload video và chờ job hoàn tất.
        </div>
      </div>
    );
  }

  const videoUrl = getBestAnnotatedVideoUrl(result);
  const phoneCsvUrl = toBackendAssetUrl(result.assets?.phone_segments_csv_url || result.assets?.phone_segments_csv_path || "");
  const eventsCsvUrl = toBackendAssetUrl(result.assets?.events_frame_csv_url || result.assets?.events_frame_csv_path || "");

  const summary = result.summary || null;
  const distribution = Object.entries(result.label_distribution || {});
  const totalDistribution = distribution.reduce((acc, [, count]) => acc + Number(count || 0), 0);

  const clips = result.clips || [];
  const phoneSegments = result.phone_segments || [];
  const eventsPreview = result.events_preview || [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Latest Job Result</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Đây là preview nhanh của job vừa chạy xong: video annotated, summary,
              label distribution, phone segments, clips và events preview.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {result.session_key ? (
              <>
                <Link
                  href={`/sessions/${encodeURIComponent(result.session_key)}`}
                  className="rounded-xl bg-[#1f4f95] px-4 py-2 text-sm font-medium text-white"
                >
                  Open Session Analysis
                </Link>

                <Link
                  href={`/telegram?sessionKey=${encodeURIComponent(result.session_key)}`}
                  className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Open Telegram
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Job ID</div>
            <div className="mt-1 break-all text-sm font-semibold text-slate-900">
              {result.job_id}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Session key</div>
            <div className="mt-1 break-all text-sm font-semibold text-slate-900">
              {result.session_key}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Status</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {result.status || "done"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Session ID</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {result.session_id ?? "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Annotated Video</h3>

          {videoUrl ? (
            <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
              <video
                src={videoUrl}
                controls
                playsInline
                className="max-h-[520px] w-full bg-black"
              />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
              Chưa tìm thấy annotated video.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Summary</h3>

            {summary ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Video name</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.video_name || "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Duration</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.video_duration_sec != null
                      ? `${summary.video_duration_sec.toFixed(1)}s`
                      : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Targets locked</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.num_targets_locked ?? 0}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Frame events</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.num_frame_events ?? 0}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Phone segments</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.num_phone_segments ?? 0}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Phone clips ready</span>
                  <span className="text-right font-medium text-slate-900">
                    {summary.num_phone_clips_ready ?? 0}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                Chưa có summary.
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Artifacts</h3>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {eventsCsvUrl ? (
                  <a
                    href={eventsCsvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border px-3 py-2 font-medium text-slate-700"
                  >
                    Open events_frame.csv
                  </a>
                ) : null}

                {phoneCsvUrl ? (
                  <a
                    href={phoneCsvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border px-3 py-2 font-medium text-slate-700"
                  >
                    Open phone_segments.csv
                  </a>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                Nếu CSV mở được và video annotated mở được thì pipeline worker → backend → static assets
                đã thông từ đầu tới cuối.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Behavior Distribution</h3>

          {distribution.length > 0 ? (
            <div className="mt-4 space-y-3">
              {distribution.map(([label, count]) => {
                const value = Number(count || 0);
                const ratio = Number(formatPercent(value, totalDistribution));

                return (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-slate-500">
                        {value} ({ratio.toFixed(1)}%)
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-[#1f4f95]"
                        style={{ width: `${Math.max(0, Math.min(ratio, 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
              Chưa có label distribution.
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Phone Segments</h3>

          {phoneSegments.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {phoneSegments.slice(0, 20).map((item, idx) => {
                const clipUrl = getClipUrl(item);

                return (
                  <div
                    key={`${item.target_id ?? "x"}-${item.start_sec ?? idx}-${idx}`}
                    className="rounded-2xl border bg-slate-50 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      Target {item.target_id ?? "-"} • {item.label || "using_phone"}
                    </div>

                    <div className="mt-2 text-sm text-slate-600">
                      Time: <b>{formatTime(item.start_sec)}</b> -{" "}
                      <b>{formatTime(item.end_sec)}</b>
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Duration: <b>{item.duration_sec != null ? `${item.duration_sec.toFixed(1)}s` : "-"}</b>
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Peak conf: <b>{item.peak_conf ?? "-"}</b> • Avg conf: <b>{item.avg_conf ?? "-"}</b>
                    </div>

                    {clipUrl ? (
                      <div className="mt-3">
                        <video
                          src={clipUrl}
                          controls
                          playsInline
                          className="w-full rounded-xl border bg-black"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
              Chưa có phone segments.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Clips</h3>

          {clips.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {clips.slice(0, 12).map((clip, idx) => {
                const clipUrl = getClipUrl(clip);

                return (
                  <div
                    key={`${clip.target_id ?? "x"}-${clip.start_sec ?? idx}-${idx}`}
                    className="rounded-2xl border bg-slate-50 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      Target {clip.target_id ?? "-"} • {clip.label || "-"}
                    </div>

                    <div className="mt-2 text-sm text-slate-600">
                      Time: <b>{formatTime(clip.start_sec)}</b> - <b>{formatTime(clip.end_sec)}</b>
                    </div>

                    {clipUrl ? (
                      <div className="mt-3">
                        <video
                          src={clipUrl}
                          controls
                          playsInline
                          className="w-full rounded-xl border bg-black"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
              Chưa có clips.
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Events Preview</h3>

          {eventsPreview.length > 0 ? (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Frame</th>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Target</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-left">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsPreview.map((row, idx) => (
                    <tr key={`${row.frame_idx ?? idx}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{row.frame_idx ?? "-"}</td>
                      <td className="px-3 py-2">{formatTime(row.time_sec)}</td>
                      <td className="px-3 py-2">{row.target_id ?? "-"}</td>
                      <td className="px-3 py-2">{row.label || "-"}</td>
                      <td className="px-3 py-2">{row.confidence ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
              Chưa có events preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}