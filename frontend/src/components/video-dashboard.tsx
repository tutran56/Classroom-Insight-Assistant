"use client";

import { useMemo, useState } from "react";
import {
  SessionItem,
  TopNegativeWindowResponse,
  TopPhoneWindowResponse,
  getTopNegativeWindow,
  getTopPhoneWindow,
  toBackendAssetUrl,
} from "@/lib/api";

type Props = {
  classes: SessionItem[];
};

export default function VideoDashboard({ classes }: Props) {
  const [selectedId, setSelectedId] = useState<number>(classes[0]?.id ?? 0);
  const [phoneResult, setPhoneResult] = useState<TopPhoneWindowResponse | null>(null);
  const [negativeResult, setNegativeResult] = useState<TopNegativeWindowResponse | null>(null);
  const [loadingType, setLoadingType] = useState<"phone" | "negative" | null>(null);
  const [error, setError] = useState("");

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedId) ?? null,
    [classes, selectedId]
  );

  const rawVideoPath = selectedClass?.annotated_video_path || "";
  const webVideoPath = rawVideoPath.replace("annotated_video.mp4", "annotated_video_web.mp4");
  const videoUrl = webVideoPath ? toBackendAssetUrl(webVideoPath) : "";

  async function handleTopPhone() {
    if (!selectedClass) return;
    try {
      setError("");
      setLoadingType("phone");
      const data = await getTopPhoneWindow(selectedClass.id, 5);
      setPhoneResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được API top phone.");
    } finally {
      setLoadingType(null);
    }
  }

  async function handleTopNegative() {
    if (!selectedClass) return;
    try {
      setError("");
      setLoadingType("negative");
      const data = await getTopNegativeWindow(selectedClass.id, 5);
      setNegativeResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được API top negative.");
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Màn hình 1 — Video + chọn lớp + search</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chọn lớp học, xem video annotated, rồi bấm search để lấy mốc thời gian nổi bật.
        </p>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">Chọn lớp học</label>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(Number(e.target.value));
              setPhoneResult(null);
              setNegativeResult(null);
              setError("");
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.class_name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            onClick={handleTopPhone}
            className="rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800"
          >
            {loadingType === "phone" ? "Đang tìm Top phone..." : "Tìm lúc dùng điện thoại nhiều nhất"}
          </button>

          <button
            onClick={handleTopNegative}
            className="rounded-xl bg-slate-700 px-4 py-3 text-white hover:bg-slate-600"
          >
            {loadingType === "negative" ? "Đang tìm Top negative..." : "Tìm lúc lớp tiêu cực nhất"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Video annotated</h3>
        <p className="mt-1 text-sm text-slate-500">
          {selectedClass ? `${selectedClass.class_name} — session_id ${selectedClass.id}` : "Chưa có lớp học"}
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
          {videoUrl ? (
            <video
              key={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="h-auto w-full"
              src={videoUrl}
            />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-slate-300">
              Không có video.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Kết quả Top phone</h3>
          {!phoneResult ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có dữ liệu. Hãy bấm nút tìm kiếm.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>Thời gian: {phoneResult.window_start_sec}s → {phoneResult.window_end_sec}s</div>
              <div>Số target khác nhau: {phoneResult.distinct_target_count}</div>
              <div>Số event: {phoneResult.event_count}</div>
              <div>Target IDs: {phoneResult.target_ids.join(", ") || "N/A"}</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Kết quả Top negative</h3>
          {!negativeResult ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có dữ liệu. Hãy bấm nút tìm kiếm.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>Thời gian: {negativeResult.window_start_sec}s → {negativeResult.window_end_sec}s</div>
              <div>Negative score: {negativeResult.negative_score}</div>
              <div>using_phone: {negativeResult.breakdown.using_phone}</div>
              <div>sleeping: {negativeResult.breakdown.sleeping}</div>
              <div>turning: {negativeResult.breakdown.turning}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
