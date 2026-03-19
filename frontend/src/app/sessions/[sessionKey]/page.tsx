"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AICommentaryResponse,
  BehaviorDistributionResponse,
  SessionItem,
  TelegramLogListResponse,
  TopNegativeWindowResponse,
  getAICommentary,
  getBehaviorDistribution,
  getSessions,
  getTelegramLogs,
  getTopNegativeWindow,
  toBackendAssetUrl,
} from "@/lib/api";
import SessionPromptSearch from "@/components/session-prompt-search";

const DNU_LOGO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/d/d3/Logo_DAI_NAM.png";

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có thời gian";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("vi-VN");
}

function sentimentLabel(value?: string) {
  switch (value) {
    case "tich_cuc":
      return "Tích cực";
    case "tuong_doi_on":
      return "Tương đối ổn";
    case "tieu_cuc":
      return "Tiêu cực";
    case "rat_tieu_cuc":
      return "Rất tiêu cực";
    default:
      return "Chưa có";
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSessionKey(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return "";
  return raw.replace(/\\/g, "/").split("/").pop() || "";
}

export default function SessionAnalysisPage() {
  const params = useParams<{ sessionKey: string }>();
  const routeSessionKey = normalizeSessionKey(params?.sessionKey || "");

  const [session, setSession] = useState<SessionItem | null>(null);
  const [distribution, setDistribution] =
    useState<BehaviorDistributionResponse | null>(null);
  const [aiCommentary, setAiCommentary] =
    useState<AICommentaryResponse | null>(null);
  const [topNegative, setTopNegative] =
    useState<TopNegativeWindowResponse | null>(null);
  const [telegramLogs, setTelegramLogs] =
    useState<TelegramLogListResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");

        const data = await getSessions();
        const items = data.items || [];

        const found =
          items.find(
            (item) => normalizeSessionKey(item.session_key) === routeSessionKey
          ) || null;

        if (!found) {
          throw new Error("Không tìm thấy session ổn định trong database.");
        }

        if (!mounted) return;
        setSession(found);

        const [dist, commentary, negative, logs] = await Promise.all([
          getBehaviorDistribution(found.id).catch(() => null),
          getAICommentary(found.id).catch(() => null),
          getTopNegativeWindow(found.id).catch(() => null),
          getTelegramLogs(found.id).catch(() => null),
        ]);

        if (!mounted) return;
        setDistribution(dist);
        setAiCommentary(commentary);
        setTopNegative(negative);
        setTelegramLogs(logs);
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : "Không tải được Session Analysis."
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      mounted = false;
    };
  }, [routeSessionKey]);

  const videoUrl = useMemo(() => {
    if (!session) return "";

    if (session.annotated_video_url) {
      return toBackendAssetUrl(session.annotated_video_url);
    }

    if (session.annotated_video_path) {
      return toBackendAssetUrl(session.annotated_video_path);
    }

    return "";
  }, [session]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryAutoplay = async () => {
      try {
        video.currentTime = 0;
        await video.play();
      } catch {}
    };

    if (video.readyState >= 1) {
      void tryAutoplay();
      return;
    }

    const onLoadedMetadata = async () => {
      await tryAutoplay();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    return () => video.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || pendingSeekTime === null) return;

    const seekTo = Math.max(0, pendingSeekTime);

    const runSeekAndPlay = async () => {
      try {
        video.currentTime = seekTo;
        await video.play();
      } catch {
        try {
          video.currentTime = seekTo;
        } catch {}
      }
    };

    if (video.readyState >= 1) {
      void runSeekAndPlay();
      setPendingSeekTime(null);
      return;
    }

    const onLoadedMetadata = async () => {
      await runSeekAndPlay();
      setPendingSeekTime(null);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    return () => video.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [pendingSeekTime, videoUrl]);

  function handlePromptSeek(timeSec: number) {
    setPendingSeekTime(timeSec);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="bg-[#114084] text-white shadow-lg">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  <img
                    src={DNU_LOGO_URL}
                    alt="DNU logo"
                    className="h-12 w-12 object-contain"
                  />
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-wide">FIT-DNU</div>
                  <div className="text-sm text-blue-100">
                    AI Classroom Behavior System
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
                <div className="font-semibold">Faculty of Information Technology</div>
                <div className="text-blue-100">Da Nang University</div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="rounded-2xl border border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
            Đang tải Session Analysis...
          </div>
        </main>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="bg-[#114084] text-white shadow-lg">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  <img
                    src={DNU_LOGO_URL}
                    alt="DNU logo"
                    className="h-12 w-12 object-contain"
                  />
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-wide">FIT-DNU</div>
                  <div className="text-sm text-blue-100">
                    AI Classroom Behavior System
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
                <div className="font-semibold">Faculty of Information Technology</div>
                <div className="text-blue-100">Da Nang University</div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-4 px-6 py-8">
          <Link
            href="/dashboard"
            className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Quay lại Dashboard
          </Link>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {error || "Không tìm thấy session."}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#114084] text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                <img
                  src={DNU_LOGO_URL}
                  alt="DNU logo"
                  className="h-12 w-12 object-contain"
                />
              </div>

              <div>
                <div className="text-2xl font-bold tracking-wide">FIT-DNU</div>
                <div className="text-sm text-blue-100">
                  AI Classroom Behavior System
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white/10 p-2">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#114084] shadow-sm"
              >
                Dashboard
              </Link>
              <div className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white">
                Session Analysis
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <div className="font-semibold">Faculty of Information Technology</div>
              <div className="text-blue-100">Da Nang University</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Class
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {session.class_name || "-"}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Session Key
              </div>
              <div className="mt-2 break-all text-sm font-semibold text-slate-900">
                {session.session_key}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Video
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {session.video_name || "Chưa có"}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Imported
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatDateTime(session.imported_at || session.created_at)}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <div className="text-lg font-bold text-slate-900">
                Annotated Video
              </div>
              <div className="text-sm text-slate-500">
                Session ổn định để xem và jump theo prompt.
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-black">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  key={videoUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                  loop
                  className="h-auto w-full"
                  src={videoUrl}
                />
              ) : (
                <div className="flex h-[520px] items-center justify-center text-slate-300">
                  Không có video.
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Tóm tắt nhanh</h2>

              <div className="mt-4 space-y-3 text-sm">
                {topNegative ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-700">
                    <div className="font-semibold text-slate-900">
                      Đoạn tiêu cực nhất
                    </div>
                    <div className="mt-1">
                      {Math.floor(topNegative.window_start_sec)}s →{" "}
                      {Math.floor(topNegative.window_end_sec)}s
                    </div>
                    <div className="mt-1">
                      Score: {topNegative.negative_score}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">
                    Chưa có dữ liệu top negative.
                  </div>
                )}

                {aiCommentary ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                    <div className="font-semibold text-slate-900">
                      Nhận xét lớp học
                    </div>
                    <div className="mt-1">
                      {sentimentLabel(aiCommentary.overall_sentiment)}
                    </div>
                    <div className="mt-2 text-sm leading-6">
                      {aiCommentary.summary_text}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">
                    Chưa có nhận xét AI.
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <SessionPromptSearch sessionId={session.id} onSeek={handlePromptSeek} />

        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Tổng số hành vi</h2>

          {!distribution ? (
            <div className="mt-3 text-sm text-slate-500">
              Chưa có thống kê hành vi.
            </div>
          ) : distribution.items.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">
              Không có dữ liệu hành vi.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {distribution.items.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                >
                  <div className="font-semibold text-slate-900">{item.label}</div>
                  <div className="mt-2">{item.count} lần</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Lịch sử đã gửi Telegram</h2>

          {!telegramLogs ? (
            <div className="mt-3 text-sm text-slate-500">
              Chưa có log Telegram.
            </div>
          ) : telegramLogs.items.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">
              Chưa có bản ghi Telegram nào.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {telegramLogs.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                >
                  <div>
                    <span className="text-slate-500">Thời gian gửi:</span>{" "}
                    <b>{formatDateTime(item.sent_at)}</b>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">Lớp:</span>{" "}
                    <b>{session.class_name || "-"}</b>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">Video / session:</span>{" "}
                    <b>{session.session_key}</b>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">Nội dung gửi:</span>{" "}
                    <b>{item.message || item.label || "-"}</b>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">Trạng thái:</span>{" "}
                    <b>{item.status || "-"}</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-8 bg-[#114084] text-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white">
                <img
                  src={DNU_LOGO_URL}
                  alt="DNU logo"
                  className="h-10 w-10 object-contain"
                />
              </div>

              <div>
                <div className="text-lg font-bold">FIT-DNU</div>
                <div className="text-sm text-blue-100">
                  AI Classroom Behavior System
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-blue-100 md:grid-cols-3 md:gap-6">
              <div>
                <div className="font-semibold text-white">Session Analysis</div>
                <div className="mt-1">
                  Xem annotated video, thống kê hành vi và prompt search theo session.
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">Thông báo</div>
                <div className="mt-1">
                  Theo dõi lịch sử gửi clip cảnh báo cho giáo viên.
                </div>
              </div>
              <div>
                <div className="font-semibold text-white">Phiên bản demo</div>
                <div className="mt-1">
                  Phù hợp cho đồ án AI Classroom Behavior System.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-white/15 pt-4 text-sm text-blue-100">
            © 2026 FIT-DNU. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}