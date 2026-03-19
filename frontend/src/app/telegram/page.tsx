import Link from "next/link";
import AppNav from "@/components/app-nav";
import {
  getSessions,
  getTelegramClipUrl,
  getTelegramLogs,
  seedTelegramLogs,
  type SessionItem,
} from "@/lib/api";

type PageProps = {
  searchParams?: Promise<{
    sessionKey?: string;
  }>;
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString();
}

function normalizeClassLabel(value?: string | null) {
  const raw = String(value || "").toLowerCase();

  if (raw.includes("classroom_a")) return "Classroom A";
  if (raw.includes("classroom_b")) return "Classroom B";

  return value || "-";
}

async function resolveCurrentSession(
  sessions: SessionItem[],
  sessionKey?: string
): Promise<SessionItem | null> {
  if (sessionKey) {
    const found = sessions.find((item) => item.session_key === sessionKey);
    if (found) return found;
  }

  return sessions[0] || null;
}

export default async function TelegramPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const sessionKey = resolvedSearchParams.sessionKey
    ? decodeURIComponent(resolvedSearchParams.sessionKey)
    : undefined;

  const sessionsResponse = await getSessions().catch(() => ({ items: [] }));
  const sessions = sessionsResponse.items || [];
  const currentSession = await resolveCurrentSession(sessions, sessionKey);

  const logs = currentSession
    ? await getTelegramLogs(currentSession.id).catch(() => null)
    : null;

  const seeded = currentSession
    ? await seedTelegramLogs(currentSession.id).catch(() => null)
    : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <AppNav />

        <div className="mb-8">
          <div className="inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            Screen 4
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Telegram Alert Preview
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Xem session nào có clip cảnh báo, preview log gửi Telegram, và kiểm tra
            dữ liệu clip 5 giây + target_id + label trước khi nối flow gửi thật.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>

            {sessions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {sessions.map((item) => {
                  const active = currentSession?.id === item.id;

                  return (
                    <Link
                      key={item.id}
                      href={`/telegram?sessionKey=${encodeURIComponent(item.session_key)}`}
                      className={`block rounded-2xl border p-4 transition ${
                        active
                          ? "border-[#1f4f95] bg-blue-50"
                          : "bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {item.session_key}
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        {normalizeClassLabel(item.class_name)}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {item.video_name || "No video name"}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                Chưa có session nào trong DB.
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Current Session
                  </h2>

                  {currentSession ? (
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      <div>
                        Session key: <b>{currentSession.session_key}</b>
                      </div>
                      <div>
                        Class: <b>{normalizeClassLabel(currentSession.class_name)}</b>
                      </div>
                      <div>
                        Video: <b>{currentSession.video_name || "-"}</b>
                      </div>
                      <div>
                        Created: <b>{formatDate(currentSession.created_at)}</b>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">
                      Chưa chọn được session.
                    </div>
                  )}
                </div>

                {currentSession ? (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/sessions/${encodeURIComponent(currentSession.session_key)}`}
                      className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      Open Session Analysis
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Seed Telegram Logs
              </h2>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                {seeded ? (
                  <>
                    <div>
                      Inserted logs: <b>{seeded.inserted_logs}</b>
                    </div>
                    <div className="mt-1">{seeded.message}</div>
                  </>
                ) : (
                  "Chưa seed được log hoặc backend chưa có dữ liệu segment phù hợp."
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Telegram Logs
                </h2>

                <div className="text-sm text-slate-500">
                  Total: <b>{logs?.total ?? 0}</b>
                </div>
              </div>

              {logs && logs.items.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {logs.items.map((item, idx) => {
                    const clipUrl = getTelegramClipUrl(item);

                    return (
                      <div
                        key={item.id ?? `${item.segment_id ?? "log"}-${idx}`}
                        className="rounded-2xl border bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {item.label || "-"} • Target {item.target_id ?? "-"}
                            </div>

                            <div className="mt-2 space-y-1 text-sm text-slate-600">
                              <div>
                                Segment ID: <b>{item.segment_id || "-"}</b>
                              </div>
                              <div>
                                Status: <b>{item.status || "-"}</b>
                              </div>
                              <div>
                                Message: <b>{item.message || "-"}</b>
                              </div>
                              <div>
                                Sent at: <b>{formatDate(item.sent_at)}</b>
                              </div>
                            </div>
                          </div>

                          <div className="w-full xl:w-[320px]">
                            {clipUrl ? (
                              <video
                                src={clipUrl}
                                controls
                                playsInline
                                className="w-full rounded-xl border bg-black"
                              />
                            ) : (
                              <div className="rounded-xl border border-dashed bg-white p-4 text-sm text-slate-500">
                                Chưa có clip preview.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                  Chưa có log Telegram cho session này.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}