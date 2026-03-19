"use client";

import { useEffect, useState } from "react";
import {
  getJobResult,
  getJobStatus,
  type JobResultResponse,
  type JobStatusResponse,
  type UploadJobResponse,
  uploadJob,
} from "@/lib/api";

type Props = {
  onJobCreated?: (job: UploadJobResponse) => void;
  onJobStatusChange?: (status: JobStatusResponse) => void;
  onJobCompleted?: (result: JobResultResponse) => void;
};

export default function UploadProcessPanel({
  onJobCreated,
  onJobStatusChange,
  onJobCompleted,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [className, setClassName] = useState("classroom_a");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultFetched, setResultFetched] = useState(false);

  async function handleUpload() {
    if (!file) return;

    setLoading(true);
    setError("");
    setJobId("");
    setStatus("");
    setProgress(0);
    setMessage("");
    setResultLoading(false);
    setResultFetched(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Backend thật đang chuẩn là class_name.
      // Giữ thêm class_id để tương thích nếu phía server cũ còn đang dùng.
      formData.append("class_name", className);
      formData.append("class_id", className);

      const res = await uploadJob(formData);

      setJobId(res.job_id);
      setStatus(res.status || "queued");
      setMessage("Job created and queued");
      onJobCreated?.(res);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Upload failed";
      setError(text);
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const s = await getJobStatus(jobId);
        if (cancelled) return;

        const nextStatus = s.status || "";
        const nextProgress = typeof s.progress === "number" ? s.progress : 0;
        const nextMessage = s.message || "";

        setStatus(nextStatus);
        setProgress(nextProgress);
        setMessage(nextMessage);
        onJobStatusChange?.(s);

        const canFetchResult =
          nextStatus === "done" &&
          s.result_ready !== false &&
          !resultFetched;

        if (canFetchResult) {
          setResultLoading(true);

          try {
            const result = await getJobResult(jobId);
            if (cancelled) return;

            setStatus(result.status || "done");
            setProgress(100);
            setMessage("Result loaded");
            setResultFetched(true);
            onJobCompleted?.(result);
          } catch (e) {
            if (cancelled) return;
            const text =
              e instanceof Error ? e.message : "Failed to load job result";
            setError(text);
            setMessage(text);
          } finally {
            if (!cancelled) {
              setResultLoading(false);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          const text =
            e instanceof Error ? e.message : "Failed to check job status";
          setError(text);
          setMessage(text);
        }
      }
    };

    void poll();

    const timer = setInterval(() => {
      if (!cancelled && !resultFetched) {
        void poll();
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, resultFetched, onJobCompleted, onJobStatusChange]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">Upload & Process</h2>

      <div className="mt-4 grid gap-3">
        <select
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          className="rounded-xl border px-3 py-2"
        >
          <option value="classroom_a">classroom_a</option>
          <option value="classroom_b">classroom_b</option>
        </select>

        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="rounded-xl border px-3 py-2"
        />

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="rounded-xl bg-[#1f4f95] px-4 py-3 text-white disabled:opacity-50"
        >
          {loading ? "Đang upload..." : "Process Video"}
        </button>
      </div>

      {jobId ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <div>
            <b>Job:</b> {jobId}
          </div>
          <div>
            <b>Status:</b> {status}
          </div>
          <div>
            <b>Progress:</b> {progress}%
          </div>
          <div>
            <b>Message:</b> {message || "-"}
          </div>
          <div>
            <b>Result loading:</b> {resultLoading ? "yes" : "no"}
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#1f4f95] transition-all"
            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}