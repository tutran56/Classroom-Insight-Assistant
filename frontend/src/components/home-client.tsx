"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import JobResultDashboard from "@/components/job-result-dashboard";
import UploadProcessPanel from "@/components/upload-process-panel";
import {
  type JobResultResponse,
  type JobStatusResponse,
  type UploadJobResponse,
} from "@/lib/api";

function normalizeClassName(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw.includes("classroom_b") || raw === "b") {
    return "classroom_b";
  }

  return "classroom_a";
}

function statusTone(status?: string | null) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "done") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (raw === "failed") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (raw === "processing") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function HomeClient() {
  const [currentJob, setCurrentJob] = useState<UploadJobResponse | null>(null);
  const [currentStatus, setCurrentStatus] = useState<JobStatusResponse | null>(null);
  const [currentResult, setCurrentResult] = useState<JobResultResponse | null>(null);

  const sessionKey =
    currentResult?.session_key || currentStatus?.session_key || currentJob?.session_key || "";

  const sessionId = currentResult?.session_id ?? currentStatus?.session_id ?? null;

  const normalizedClass = useMemo(() => {
    const fromSessionKey = normalizeClassName(sessionKey);
    return fromSessionKey;
  }, [sessionKey]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <UploadProcessPanel
            onJobCreated={(job) => {
              setCurrentJob(job);
              setCurrentStatus(null);
              setCurrentResult(null);
            }}
            onJobStatusChange={(status) => {
              setCurrentStatus(status);
            }}
            onJobCompleted={(result) => {
              setCurrentResult(result);
            }}
          />

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Current Pipeline State</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Job ID</span>
                <span className="break-all text-right font-medium text-slate-900">
                  {currentJob?.job_id || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Session key</span>
                <span className="break-all text-right font-medium text-slate-900">
                  {sessionKey || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Class</span>
                <span className="text-right font-medium text-slate-900">
                  {sessionKey ? normalizedClass : "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Session ID</span>
                <span className="text-right font-medium text-slate-900">
                  {sessionId ?? "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Status</span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                    currentStatus?.status || currentResult?.status || currentJob?.status
                  )}`}
                >
                  {currentStatus?.status || currentResult?.status || currentJob?.status || "idle"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Result ready</span>
                <span className="text-right font-medium text-slate-900">
                  {currentStatus?.result_ready === true
                    ? "yes"
                    : currentStatus?.result_ready === false
                    ? "no"
                    : currentResult
                    ? "yes"
                    : "-"}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Màn này chỉ nên làm 2 việc:
              <br />
              1. Upload video và theo dõi job.
              <br />
              2. Xem nhanh kết quả vừa chạy xong trước khi mở Dashboard / Session Analysis /
              Telegram.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open Dashboard
              </Link>

              {sessionKey ? (
                <>
                  <Link
                    href={`/sessions/${encodeURIComponent(sessionKey)}`}
                    className="rounded-xl bg-[#1f4f95] px-4 py-2 text-sm font-medium text-white"
                  >
                    Open Session Analysis
                  </Link>

                  <Link
                    href={`/telegram?sessionKey=${encodeURIComponent(sessionKey)}`}
                    className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open Telegram
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <JobResultDashboard result={currentResult} />
        </div>
      </div>
    </div>
  );
}