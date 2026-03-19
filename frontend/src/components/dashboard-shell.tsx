"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AICommentaryResponse,
  BehaviorDistributionResponse,
  SessionItem,
  TelegramLogListResponse,
  getAICommentary,
  getBehaviorDistribution,
  getJobResult,
  getJobStatus,
  getSessions,
  getTelegramLogs,
  searchSessionByPrompt,
  toBackendAssetUrl,
  uploadJob,
} from "@/lib/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type TabKey = "classroom" | "analytics" | "telegram";
type UploadClassKey = "classroom_a" | "classroom_b";

type Props = {
  classes: SessionItem[];
};

type PieLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number | string;
  percent?: number;
  index?: number;
};

type ActiveJobState = {
  jobId: string;
  className: UploadClassKey;
  status: string;
  progress: number;
  message: string;
  resultReady: boolean;
  sessionKey?: string | null;
};

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
  polarity?: "positive" | "negative" | "mixed" | string | null;
  target_id?: number | null;
  target_ids?: number[];
  count?: number | null;
  score?: number | null;
  positive_score?: number | null;
  negative_score?: number | null;
  recommended_clip_path?: string | null;
  recommended_segment?: PromptMatch | null;
  matches?: PromptMatch[];
  breakdown?: Record<string, number>;
};

type TelegramSendWindowResponse = {
  session_id: number;
  session_key: string;
  class_name: string;
  window_start_sec: number;
  window_end_sec: number;
  clip_path?: string | null;
  telegram_status: string;
  message: string;
  sent_at?: string | null;
  reason?: string | null;
};

const PIE_COLORS = [
  "#2da8df",
  "#8cc63f",
  "#f59a1b",
  "#d9d9d9",
  "#0d79c6",
  "#7c3aed",
];

const PROMPT_SUGGESTIONS = [
  "đoạn nào lớp tiêu cực nhất?",
  "đoạn nào dùng điện thoại nhiều nhất?",
  "có ai ngủ không?",
  "target nào turning nhiều nhất?",
  "đoạn nào nên gửi giáo viên?",
  "những sinh viên nào có dấu hiệu tích cực?",
  "ai giơ tay nhiều nhất?",
  "đoạn nào lớp tích cực nhất?",
];

const DNU_LOGO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/d/d3/Logo_DAI_NAM.png";

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

function normalizeClassKey(item: SessionItem) {
  const candidates = [
    item.class_key,
    item.class_name,
    item.session_key,
    item.video_name,
  ]
    .filter(Boolean)
    .map((value) => normalizeText(value));

  for (const raw of candidates) {
    const normalized = raw.replace(/-/g, "_").replace(/\s+/g, " ").trim();
    const compact = normalized.replace(/\s+/g, "_");

    if (
      normalized === "classroom_a" ||
      normalized === "classroom a" ||
      normalized === "a" ||
      normalized === "class a" ||
      normalized === "class_a" ||
      compact.includes("classroom_a") ||
      compact.startsWith("classrooma_") ||
      compact === "classrooma"
    ) {
      return "classroom_a";
    }

    if (
      normalized === "classroom_b" ||
      normalized === "classroom b" ||
      normalized === "b" ||
      normalized === "class b" ||
      normalized === "class_b" ||
      compact.includes("classroom_b") ||
      compact.startsWith("classroomb_") ||
      compact === "classroomb"
    ) {
      return "classroom_b";
    }
  }

  return "unknown";
}

function mapClassDisplayName(
  className?: string | null,
  classKey?: string | null
) {
  if (classKey === "classroom_a" || className === "Classroom A") return "Classroom A";
  if (classKey === "classroom_b" || className === "Classroom B") return "Classroom B";
  return className || "Lớp học";
}

function mapClassSectionTitle(classKey: string) {
  if (classKey === "classroom_a") return "Classroom A";
  if (classKey === "classroom_b") return "Classroom B";
  return "Khác";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có thời gian";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("vi-VN");
}

function buildSessionTitle(item: SessionItem) {
  return item.video_name?.trim() || item.session_key || `Session #${item.id}`;
}

function normalizeClasses(items: SessionItem[]) {
  const usable = items
    .map((item) => ({
      ...item,
      session_key: normalizeSessionKey(item.session_key),
      class_key: item.class_key || normalizeClassKey(item),
    }))
    .filter((item) => item && item.id && item.session_key)
    .filter(
      (item) =>
        item.class_key === "classroom_a" || item.class_key === "classroom_b"
    );

  const bestBySessionKey = new Map<string, SessionItem>();

  for (const item of usable) {
    const existing = bestBySessionKey.get(item.session_key);
    if (!existing) {
      bestBySessionKey.set(item.session_key, item);
      continue;
    }

    const existingTime = new Date(
      existing.created_at || existing.imported_at || 0
    ).getTime();
    const currentTime = new Date(
      item.created_at || item.imported_at || 0
    ).getTime();

    if (currentTime >= existingTime) {
      bestBySessionKey.set(item.session_key, item);
    }
  }

  return Array.from(bestBySessionKey.values()).sort((a, b) => {
    const ta = new Date(a.created_at || a.imported_at || 0).getTime();
    const tb = new Date(b.created_at || b.imported_at || 0).getTime();
    return tb - ta;
  });
}

function renderPercentLabel(props: PieLabelProps) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    outerRadius = 0,
    percent = 0,
    index = 0,
  } = props;

  const safeOuterRadius =
    typeof outerRadius === "number" ? outerRadius : Number(outerRadius) || 0;

  const RADIAN = Math.PI / 180;

  const sx = cx + (safeOuterRadius + 2) * Math.cos(-midAngle * RADIAN);
  const sy = cy + (safeOuterRadius + 2) * Math.sin(-midAngle * RADIAN);
  const mx = cx + (safeOuterRadius + 28) * Math.cos(-midAngle * RADIAN);
  const my = cy + (safeOuterRadius + 28) * Math.sin(-midAngle * RADIAN);
  const ex = mx + (Math.cos(-midAngle * RADIAN) >= 0 ? 26 : -26);
  const ey = my;

  const value = `${Math.round(percent * 100)}%`;
  const color = PIE_COLORS[index % PIE_COLORS.length];

  return (
    <g>
      <path
        d={`M${sx},${sy} L${mx},${my} L${ex},${ey}`}
        stroke={color}
        fill="none"
        strokeWidth={2}
      />
      <circle
        cx={ex}
        cy={ey}
        r={26}
        fill="#f3f4f6"
        stroke="#d4d4d8"
        strokeWidth={3}
      />
      <text
        x={ex}
        y={ey + 6}
        textAnchor="middle"
        fill="#8c8c8c"
        fontSize={14}
        fontWeight={700}
      >
        {value}
      </text>
    </g>
  );
}

function navButtonClass(active: boolean) {
  return active
    ? "rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#114084] shadow-sm"
    : "rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white hover:bg-white/20";
}

function filterButtonClass(active: boolean) {
  return active
    ? "rounded-full bg-[#114084] px-4 py-2 text-sm text-white"
    : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50";
}

function classOptionButton(active: boolean) {
  return active
    ? "rounded-2xl border-2 border-[#114084] bg-blue-50 px-4 py-4 text-left shadow-sm"
    : "rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left hover:border-slate-300 hover:bg-slate-50";
}

function statusBadgeTone(status?: string | null, resultReady?: boolean) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (raw === "done" && resultReady === false) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (raw === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (raw === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusLabel(job: ActiveJobState | null) {
  if (!job) return "";

  const raw = String(job.status || "").trim().toLowerCase();
  if (raw === "done" && !job.resultReady) return "Finalizing...";
  if (raw === "done") return `Done ${job.progress}%`;
  if (raw === "processing") return `Processing ${job.progress}%`;
  if (raw === "failed") return "Failed";
  return `Queued ${job.progress}%`;
}

function uploadButtonLabel(job: ActiveJobState | null, isUploading: boolean) {
  if (isUploading) return "Uploading...";
  if (!job) return "Upload";
  return `Upload • ${statusLabel(job)}`;
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
      return "Target nổi bật theo hành vi tiêu cực";
    case "telegram_candidate_window":
      return "Đoạn nên gửi giáo viên";
    case "top_positive_window":
      return "Đoạn tích cực nổi bật";
    case "top_positive_target":
      return "Sinh viên tích cực nổi bật";
    case "top_target_behavior_positive":
      return "Target nổi bật theo hành vi tích cực";
    case "top_positive_low_negative_target":
      return "Tích cực và ít tiêu cực";
    case "fallback_negative_window":
      return "Kết quả fallback";
    default:
      return queryType || "Không xác định";
  }
}

function labelBehavior(behavior?: string | null) {
  switch (behavior) {
    case "using_phone":
      return "Dùng điện thoại";
    case "sleeping":
      return "Ngủ gật";
    case "turning":
      return "Turning";
    case "writing":
      return "Viết bài";
    case "reading":
      return "Đọc";
    case "raising_hand":
      return "Giơ tay";
    default:
      return behavior || "-";
  }
}

function polarityBadgeClass(polarity?: string | null) {
  switch (polarity) {
    case "positive":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "negative":
      return "border-red-200 bg-red-50 text-red-700";
    case "mixed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function polarityLabel(polarity?: string | null) {
  switch (polarity) {
    case "positive":
      return "Tích cực";
    case "negative":
      return "Tiêu cực";
    case "mixed":
      return "Hỗn hợp";
    default:
      return "Chưa rõ";
  }
}

function formatSec(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return "-";
  return `${Math.floor(value)}s`;
}

function clipUrlFromPath(path?: string | null) {
  return toBackendAssetUrl(path || "");
}

async function sendTelegramWindow(
  sessionId: number,
  payload: {
    window_start_sec: number;
    window_end_sec: number;
    reason?: string;
    class_name?: string;
    use_existing_phone_clip_first?: boolean;
  }
): Promise<TelegramSendWindowResponse> {
  const url = toBackendAssetUrl(`/classes-db/${sessionId}/telegram-send-window`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      window_start_sec: payload.window_start_sec,
      window_end_sec: payload.window_end_sec,
      reason: payload.reason,
      class_name: payload.class_name,
      use_existing_phone_clip_first:
        payload.use_existing_phone_clip_first ?? true,
    }),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(
      (typeof parsed?.detail === "string" && parsed.detail) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        text ||
        "Gửi Telegram thất bại."
    );
  }

  return parsed as unknown as TelegramSendWindowResponse;
}

export default function DashboardShell({ classes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawClassKey = normalizeText(searchParams.get("classKey"));
  const selectedClassFilter =
    rawClassKey === "classroom_a" || rawClassKey === "classroom_b"
      ? rawClassKey
      : null;

  const [activeTab, setActiveTab] = useState<TabKey>("classroom");
  const [selectedId, setSelectedId] = useState<number>(0);

  const [distribution, setDistribution] =
    useState<BehaviorDistributionResponse | null>(null);
  const [aiCommentary, setAiCommentary] =
    useState<AICommentaryResponse | null>(null);
  const [telegramLogs, setTelegramLogs] =
    useState<TelegramLogListResponse | null>(null);

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);

  const [dashboardClasses, setDashboardClasses] = useState<SessionItem[]>(classes);
  const [activeJob, setActiveJob] = useState<ActiveJobState | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadClassChoice, setUploadClassChoice] =
    useState<UploadClassKey>("classroom_a");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);

  const [prompt, setPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [promptResult, setPromptResult] = useState<PromptSearchResult | null>(null);

  const [telegramSendLoading, setTelegramSendLoading] = useState(false);
  const [telegramSendMessage, setTelegramSendMessage] = useState("");
  const [telegramSendError, setTelegramSendError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const isPollingRef = useRef(false);
  const isFinalizingRef = useRef(false);
  const activePollingJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDashboardClasses(classes);
  }, [classes]);

  const normalizedDashboardClasses = useMemo(
    () => normalizeClasses(dashboardClasses),
    [dashboardClasses]
  );

  const visibleDashboardClasses = useMemo(() => {
    if (!selectedClassFilter) return normalizedDashboardClasses;
    return normalizedDashboardClasses.filter(
      (item) => item.class_key === selectedClassFilter
    );
  }, [normalizedDashboardClasses, selectedClassFilter]);

  const groupedDashboardClasses = useMemo(() => {
    const source = visibleDashboardClasses;
    return {
      classroom_a: source.filter((item) => item.class_key === "classroom_a"),
      classroom_b: source.filter((item) => item.class_key === "classroom_b"),
    };
  }, [visibleDashboardClasses]);

  useEffect(() => {
    if (!visibleDashboardClasses.length) {
      setSelectedId(0);
      return;
    }

    const stillExists = visibleDashboardClasses.some((item) => item.id === selectedId);
    if (!stillExists) {
      setSelectedId(visibleDashboardClasses[0].id);
    }
  }, [visibleDashboardClasses, selectedId]);

  const selectedClass = useMemo(
    () => visibleDashboardClasses.find((item) => item.id === selectedId) ?? null,
    [visibleDashboardClasses, selectedId]
  );

  const selectedDisplayName = mapClassDisplayName(
    selectedClass?.class_name,
    selectedClass?.class_key
  );

  const videoUrl = useMemo(() => {
    if (!selectedClass) return "";
    if (selectedClass.annotated_video_url) {
      return toBackendAssetUrl(selectedClass.annotated_video_url);
    }
    if (selectedClass.annotated_video_path) {
      return toBackendAssetUrl(selectedClass.annotated_video_path);
    }
    return "";
  }, [selectedClass]);

  useEffect(() => {
    setPendingSeekTime(null);
    setDistribution(null);
    setAiCommentary(null);
    setTelegramLogs(null);
    setError("");
    setPrompt("");
    setPromptResult(null);
    setPromptError("");
    setTelegramSendMessage("");
    setTelegramSendError("");
  }, [selectedId]);

  useEffect(() => {
    if (selectedClassFilter === "classroom_b") setUploadClassChoice("classroom_b");
    else if (selectedClassFilter === "classroom_a") setUploadClassChoice("classroom_a");
  }, [selectedClassFilter]);

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

  useEffect(() => {
    return () => {
      clearPollingTimer();
      isPollingRef.current = false;
      isFinalizingRef.current = false;
      activePollingJobIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeTab === "analytics" && selectedClass) {
      if (!distribution) void handleLoadDistribution();
      if (!aiCommentary) void handleAICommentary();
    }
    if (activeTab === "telegram" && selectedClass && !telegramLogs) {
      void handleLoadTelegramLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedId]);

  function clearPollingTimer() {
    if (pollingTimerRef.current != null) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  function dismissActiveJob() {
    clearPollingTimer();
    isPollingRef.current = false;
    isFinalizingRef.current = false;
    activePollingJobIdRef.current = null;
    setActiveJob(null);
    setError("");
  }

  function dismissPromptResult() {
    setPromptResult(null);
    setPromptError("");
    setTelegramSendMessage("");
    setTelegramSendError("");
  }

  async function reloadDashboardClasses() {
    const data = await getSessions();
    const items = data.items || [];
    setDashboardClasses(items);
    return items;
  }

  async function finalizeStableJob(jobId: string) {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    try {
      setError("");

      const result = await getJobResult(jobId);
      const refreshed = await reloadDashboardClasses();
      const normalizedResultSessionKey = normalizeSessionKey(result.session_key);

      const nextMatch =
        refreshed.find(
          (item) =>
            normalizeSessionKey(item.session_key) === normalizedResultSessionKey
        ) || null;

      const uploadedClass = activeJob?.className || uploadClassChoice;
      router.replace(
        uploadedClass === "classroom_a"
          ? "/dashboard?classKey=classroom_a"
          : "/dashboard?classKey=classroom_b"
      );

      if (nextMatch?.id) {
        setSelectedId(nextMatch.id);
      }

      setActiveTab("classroom");
      setActiveJob((prev) => {
        if (!prev || prev.jobId !== jobId) return prev;
        return {
          ...prev,
          status: "done",
          progress: 100,
          resultReady: true,
          message: "Inference completed. Dashboard refreshed.",
          sessionKey: result.session_key,
        };
      });

      clearPollingTimer();
      activePollingJobIdRef.current = null;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không finalize được job đã inference xong."
      );
      throw err;
    } finally {
      isFinalizingRef.current = false;
    }
  }

  async function pollJob(jobId: string) {
    if (isPollingRef.current) return;
    if (isFinalizingRef.current) return;
    if (activePollingJobIdRef.current !== jobId) return;

    isPollingRef.current = true;

    try {
      const status = await getJobStatus(jobId);

      setError("");
      setActiveJob((prev) => {
        if (!prev || prev.jobId !== jobId) return prev;
        return {
          ...prev,
          status: status.status || prev.status,
          progress:
            typeof status.progress === "number" ? status.progress : prev.progress,
          message: status.message || prev.message,
          resultReady: status.result_ready === true,
          sessionKey: status.session_key || prev.sessionKey,
        };
      });

      const lower = String(status.status || "").toLowerCase();
      const isDone = lower === "done";
      const isFailed = lower === "failed";
      const isStable = isDone && status.result_ready === true;

      if (isFailed) {
        clearPollingTimer();
        activePollingJobIdRef.current = null;
        return;
      }

      if (isStable) {
        clearPollingTimer();
        await finalizeStableJob(jobId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không poll được trạng thái job."
      );
    } finally {
      isPollingRef.current = false;
    }
  }

  function startPolling(jobId: string) {
    clearPollingTimer();
    isPollingRef.current = false;
    isFinalizingRef.current = false;
    activePollingJobIdRef.current = jobId;

    void pollJob(jobId);

    pollingTimerRef.current = window.setInterval(() => {
      if (activePollingJobIdRef.current !== jobId) return;
      void pollJob(jobId);
    }, 3000);
  }

  function openUploadModal() {
    setError("");

    const raw = String(activeJob?.status || "").toLowerCase();
    const isBlockingActiveJob =
      !!activeJob &&
      (raw === "queued" ||
        raw === "processing" ||
        (raw === "done" && activeJob.resultReady === false));

    if (!isBlockingActiveJob) {
      setSelectedUploadFile(null);
    }

    setUploadModalOpen(true);
  }

  function closeUploadModal() {
    if (isUploading) return;
    setUploadModalOpen(false);
  }

  async function submitUpload() {
    if (!selectedUploadFile) {
      setError("Bạn cần chọn video trước khi bấm OK.");
      return;
    }

    try {
      setError("");
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", selectedUploadFile);
      formData.append("class_name", uploadClassChoice);
      formData.append("class_id", uploadClassChoice);

      const created = await uploadJob(formData);

      setActiveJob({
        jobId: created.job_id,
        className: uploadClassChoice,
        status: created.status || "queued",
        progress: 0,
        message: "Upload thành công. Worker sẽ tự inference.",
        resultReady: false,
        sessionKey: created.session_key,
      });

      setUploadModalOpen(false);
      setSelectedUploadFile(null);
      startPolling(created.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload video thất bại.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLoadDistribution() {
    if (!selectedClass) return;
    try {
      setError("");
      setLoading("distribution");
      const data = await getBehaviorDistribution(selectedClass.id);
      setDistribution(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không gọi được API tổng số hành vi."
      );
    } finally {
      setLoading("");
    }
  }

  async function handleAICommentary() {
    if (!selectedClass) return;
    try {
      setError("");
      setLoading("commentary");
      const data = await getAICommentary(selectedClass.id);
      setAiCommentary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được API nhận xét.");
    } finally {
      setLoading("");
    }
  }

  async function handleLoadTelegramLogs() {
    if (!selectedClass) return;
    try {
      setError("");
      setLoading("telegram");
      const data = await getTelegramLogs(selectedClass.id);
      setTelegramLogs(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không gọi được API lịch sử Telegram."
      );
    } finally {
      setLoading("");
    }
  }

  async function handlePromptSearch(submittedPrompt?: string) {
    if (!selectedClass) {
      setPromptError("Bạn cần chọn session trước khi tìm.");
      return;
    }

    const finalPrompt = (submittedPrompt ?? prompt).trim();
    if (!finalPrompt) {
      setPromptError("Bạn cần nhập prompt trước khi tìm.");
      return;
    }

    try {
      setPromptLoading(true);
      setPromptError("");
      setTelegramSendMessage("");
      setTelegramSendError("");

      const data = (await searchSessionByPrompt(
        selectedClass.id,
        finalPrompt
      )) as unknown as PromptSearchResult;

      setPromptResult(data);

      if (typeof data.seek_time_sec === "number") {
        setPendingSeekTime(data.seek_time_sec);
      }
    } catch (err) {
      setPromptError(
        err instanceof Error ? err.message : "Không tìm kiếm được prompt."
      );
    } finally {
      setPromptLoading(false);
    }
  }

  function handleQuickPrompt(value: string) {
    setPrompt(value);
    void handlePromptSearch(value);
  }

  async function handleSendTelegramFromPrompt() {
    if (!selectedClass || !promptResult) {
      setTelegramSendError("Chưa có kết quả prompt để gửi Telegram.");
      return;
    }

    if (
      typeof promptResult.window_start_sec !== "number" ||
      typeof promptResult.window_end_sec !== "number"
    ) {
      setTelegramSendError("Kết quả prompt chưa có window hợp lệ.");
      return;
    }

    try {
      setTelegramSendLoading(true);
      setTelegramSendError("");
      setTelegramSendMessage("");

      const result = await sendTelegramWindow(selectedClass.id, {
        window_start_sec: promptResult.window_start_sec,
        window_end_sec: promptResult.window_end_sec,
        reason: promptResult.answer || "Prompt search selected window",
        class_name: promptResult.class_name || selectedClass.class_name || undefined,
        use_existing_phone_clip_first: true,
      });

      setTelegramSendMessage(result.message || "Đã gửi Telegram thành công.");
      await handleLoadTelegramLogs();
      setActiveTab("telegram");
    } catch (err) {
      setTelegramSendError(
        err instanceof Error ? err.message : "Gửi Telegram thất bại."
      );
    } finally {
      setTelegramSendLoading(false);
    }
  }

  const activeJobStatus = String(activeJob?.status || "").toLowerCase();
  const isFinalizing =
    !!activeJob &&
    activeJobStatus === "done" &&
    activeJob.resultReady === false;

  const disableUploadTrigger =
    isUploading ||
    (!!activeJob &&
      (activeJobStatus === "queued" ||
        activeJobStatus === "processing" ||
        isFinalizing));

  const canDismissActiveJob =
    !!activeJob &&
    (activeJobStatus === "done" || activeJobStatus === "failed") &&
    !isFinalizing &&
    !isUploading;

  const canSendTelegramFromPrompt =
    !!selectedClass &&
    !!promptResult &&
    typeof promptResult.window_start_sec === "number" &&
    typeof promptResult.window_end_sec === "number";

  const promptTargetIds = promptResult?.target_ids || [];
  const promptHasBreakdown =
    !!promptResult?.breakdown && Object.keys(promptResult.breakdown).length > 0;

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

            <nav className="flex flex-wrap items-center gap-2 rounded-3xl bg-white/10 p-2">
              <button
                onClick={() => setActiveTab("classroom")}
                className={navButtonClass(activeTab === "classroom")}
              >
                Trang chủ
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={navButtonClass(activeTab === "analytics")}
              >
                Nhận xét
              </button>
              <button
                onClick={() => setActiveTab("telegram")}
                className={navButtonClass(activeTab === "telegram")}
              >
                Gửi thông báo
              </button>
            </nav>

            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <div className="font-semibold">Faculty of Information Technology</div>
              <div className="text-blue-100">Dai Nam University</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/dashboard" className={filterButtonClass(!selectedClassFilter)}>
            All
          </Link>
          <Link
            href="/dashboard?classKey=classroom_a"
            className={filterButtonClass(selectedClassFilter === "classroom_a")}
          >
            Classroom A
          </Link>
          <Link
            href="/dashboard?classKey=classroom_b"
            className={filterButtonClass(selectedClassFilter === "classroom_b")}
          >
            Classroom B
          </Link>

          <button
            type="button"
            onClick={openUploadModal}
            disabled={disableUploadTrigger}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadButtonLabel(activeJob, isUploading)}
          </button>

          {activeJob ? (
            <span
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${statusBadgeTone(
                activeJob.status,
                activeJob.resultReady
              )}`}
            >
              {statusLabel(activeJob)}
            </span>
          ) : null}

          <div className="flex min-w-[320px] flex-1 items-center gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePromptSearch();
                }
              }}
              placeholder={
                selectedClass
                  ? "Hỏi tự do: tiêu cực, tích cực, phone, ngủ, giơ tay..."
                  : "Chọn session trước khi tìm"
              }
              disabled={!selectedClass || promptLoading}
              className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#114084] disabled:cursor-not-allowed disabled:bg-slate-100"
            />

            <button
              type="button"
              onClick={() => void handlePromptSearch()}
              disabled={!selectedClass || promptLoading}
              className="rounded-full bg-[#114084] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c3167] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {promptLoading ? "Đang tìm..." : "Tìm"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setSelectedUploadFile(file);
            }}
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {PROMPT_SUGGESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleQuickPrompt(item)}
              disabled={!selectedClass || promptLoading}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>

        {activeJob ? (
          <div className="mb-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-slate-700">
                    <div>Job ID: <b>{activeJob.jobId}</b></div>
                    <div className="mt-1">Session key: <b>{activeJob.sessionKey || "-"}</b></div>
                    <div className="mt-1">Class upload: <b>{activeJob.className}</b></div>
                  </div>

                  <div className="text-sm text-slate-700">
                    <div>Status: <b>{activeJob.status}</b></div>
                    <div className="mt-1">Progress: <b>{activeJob.progress}%</b></div>
                    <div className="mt-1">Message: <b>{activeJob.message || "-"}</b></div>
                  </div>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#114084] transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(activeJob.progress || 0, 100))}%`,
                    }}
                  />
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Session mới chỉ được đưa lên dashboard sau khi inference hoàn tất,
                  result ổn định và backend import session thành công.
                </div>
              </div>

              {canDismissActiveJob ? (
                <button
                  type="button"
                  onClick={dismissActiveJob}
                  className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {promptError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {promptError}
          </div>
        ) : null}

        {promptResult ? (
          <div className="mb-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prompt search
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${polarityBadgeClass(
                    promptResult.polarity
                  )}`}
                >
                  {polarityLabel(promptResult.polarity)}
                </span>
              </div>

              <button
                type="button"
                onClick={dismissPromptResult}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {labelQueryType(promptResult.query_type)}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-700">
                  {promptResult.answer || "Chưa có câu trả lời."}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {promptResult.behavior ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                      Hành vi: {labelBehavior(promptResult.behavior)}
                    </span>
                  ) : null}

                  {promptTargetIds.length > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                      Target ID: {promptTargetIds.join(", ")}
                    </span>
                  ) : null}

                  {typeof promptResult.score === "number" ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                      Score: {promptResult.score}
                    </span>
                  ) : null}
                </div>

                {promptHasBreakdown ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(promptResult.breakdown || {}).map(([key, value]) => (
                      <span
                        key={key}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                      >
                        {labelBehavior(key)}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 text-sm text-slate-700">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Seek:</span>{" "}
                  <b>{formatSec(promptResult.seek_time_sec)}</b>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Window:</span>{" "}
                  <b>
                    {formatSec(promptResult.window_start_sec)} →{" "}
                    {formatSec(promptResult.window_end_sec)}
                  </b>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Session:</span>{" "}
                  <b>{promptResult.session_key || selectedClass?.session_key || "-"}</b>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Class:</span>{" "}
                  <b>{promptResult.class_name || selectedClass?.class_name || "-"}</b>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof promptResult.seek_time_sec === "number") {
                    setPendingSeekTime(promptResult.seek_time_sec);
                  }
                }}
                disabled={typeof promptResult.seek_time_sec !== "number"}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Tới đoạn này
              </button>

              {canSendTelegramFromPrompt ? (
                <button
                  type="button"
                  onClick={() => void handleSendTelegramFromPrompt()}
                  disabled={telegramSendLoading}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {telegramSendLoading ? "Đang gửi..." : "Gửi Telegram"}
                </button>
              ) : null}
            </div>

            {telegramSendMessage ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {telegramSendMessage}
              </div>
            ) : null}

            {telegramSendError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {telegramSendError}
              </div>
            ) : null}
          </div>
        ) : null}

        {!visibleDashboardClasses.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Chưa có session ổn định để hiển thị trên dashboard.
          </div>
        ) : null}

        {visibleDashboardClasses.length > 0 && activeTab === "classroom" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {selectedDisplayName}
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedClass?.session_key || "-"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div className="text-sm text-slate-500">
                    Video:{" "}
                    <span className="font-medium text-slate-700">
                      {selectedClass?.video_name || "Chưa có"}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">
                    Imported:{" "}
                    <span className="font-medium text-slate-700">
                      {formatDateTime(selectedClass?.imported_at || selectedClass?.created_at)}
                    </span>
                  </div>
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
                  <div className="flex h-[480px] items-center justify-center text-slate-300">
                    Không có video.
                  </div>
                )}
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">DANH SÁCH SESSION</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Tổng: {visibleDashboardClasses.length}
                </span>
              </div>

              <div className="mt-4 space-y-5">
                {selectedClassFilter ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        {mapClassSectionTitle(selectedClassFilter)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {visibleDashboardClasses.length} session
                      </div>
                    </div>

                    <div className="space-y-3">
                      {visibleDashboardClasses.map((item) => {
                        const isActive = item.id === selectedId;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setSelectedId(item.id)}
                            className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                              isActive
                                ? "border-sky-400 bg-sky-50 text-slate-900"
                                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {buildSessionTitle(item)}
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-500">
                                  {item.session_key}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {formatDateTime(item.created_at || item.imported_at)}
                                </div>
                              </div>

                              {isActive ? (
                                <span className="shrink-0 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                                  Đang xem
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  (["classroom_a", "classroom_b"] as const).map((classKey) => {
                    const items = groupedDashboardClasses[classKey];
                    return (
                      <div key={classKey}>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-800">
                            {mapClassSectionTitle(classKey)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {items.length} session
                          </div>
                        </div>

                        {items.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                            Chưa có session.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {items.map((item) => {
                              const isActive = item.id === selectedId;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => setSelectedId(item.id)}
                                  className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                                    isActive
                                      ? "border-sky-400 bg-sky-50 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold">
                                        {buildSessionTitle(item)}
                                      </div>
                                      <div className="mt-1 truncate text-xs text-slate-500">
                                        {item.session_key}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {formatDateTime(item.created_at || item.imported_at)}
                                      </div>
                                    </div>

                                    {isActive ? (
                                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                                        Đang xem
                                      </span>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        ) : null}

        {visibleDashboardClasses.length > 0 && activeTab === "analytics" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {selectedDisplayName}
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedClass?.session_key}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleLoadDistribution}
                    className="rounded-xl bg-[#114084] px-4 py-3 text-sm font-medium text-white hover:bg-[#0c3167]"
                  >
                    {loading === "distribution" ? "Đang tải..." : "Tải thống kê"}
                  </button>

                  <button
                    onClick={handleAICommentary}
                    className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    {loading === "commentary" ? "Đang nhận xét..." : "Nhận xét"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">TỔNG SỐ HÀNH VI</h2>

                {!distribution ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Bấm nút để tải thống kê hành vi.
                  </p>
                ) : (
                  <div className="mt-4">
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Positive ratio
                        </div>
                        <div className="mt-2 text-2xl font-bold text-emerald-600">
                          {distribution.positive_ratio ?? 0}%
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Negative ratio
                        </div>
                        <div className="mt-2 text-2xl font-bold text-red-600">
                          {distribution.negative_ratio ?? 0}%
                        </div>
                      </div>
                    </div>

                    <div className="h-[420px] w-full rounded-2xl bg-[#f3f4f6]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={distribution.items}
                            dataKey="count"
                            cx="50%"
                            cy="55%"
                            startAngle={140}
                            endAngle={-220}
                            outerRadius={108}
                            stroke="none"
                            labelLine={false}
                            label={renderPercentLabel}
                          >
                            {distribution.items.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {distribution.items.map((item, index) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{
                                backgroundColor:
                                  PIE_COLORS[index % PIE_COLORS.length],
                              }}
                            />
                            <span>{labelBehavior(item.label)}</span>
                          </div>
                          <b>{item.count}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">NHẬN XÉT AI</h2>

                {!aiCommentary ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Bấm nút để tải nhận xét AI.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Overall sentiment
                      </div>
                      <div className="mt-2 text-lg font-bold text-slate-900">
                        {sentimentLabel(aiCommentary.overall_sentiment)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Summary
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {aiCommentary.summary_text}
                      </div>
                    </div>

                    {aiCommentary.highlights?.length ? (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Highlights
                        </div>
                        <div className="mt-2 space-y-2">
                          {aiCommentary.highlights.map((item, index) => (
                            <div
                              key={`${item}-${index}`}
                              className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Suggestion
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {aiCommentary.suggestion}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {visibleDashboardClasses.length > 0 && activeTab === "telegram" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    LỊCH SỬ GỬI THÔNG BÁO
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedDisplayName} • {selectedClass?.session_key}
                  </div>
                </div>

                <button
                  onClick={handleLoadTelegramLogs}
                  className="rounded-xl bg-[#114084] px-4 py-3 text-sm font-medium text-white hover:bg-[#0c3167]"
                >
                  {loading === "telegram" ? "Đang tải..." : "Tải lịch sử"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
              {!telegramLogs || telegramLogs.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Chưa có lịch sử gửi thông báo cho session này.
                </div>
              ) : (
                <div className="space-y-3">
                  {telegramLogs.items.map((item, index) => {
                    const clipUrl = clipUrlFromPath(item.clip_url || item.clip_path);
                    return (
                      <div
                        key={`${item.id || index}-${item.sent_at || ""}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                {item.status || "unknown"}
                              </span>
                              {item.label ? (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                  {labelBehavior(item.label)}
                                </span>
                              ) : null}
                              {typeof item.target_id === "number" ? (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                  Target {item.target_id}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 text-sm leading-6 text-slate-700">
                              {item.message || "Không có nội dung log."}
                            </div>

                            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                              <div className="rounded-xl bg-white px-3 py-2">
                                <span className="text-slate-500">Thời gian gửi:</span>{" "}
                                <b>{formatDateTime(item.sent_at)}</b>
                              </div>
                              <div className="rounded-xl bg-white px-3 py-2">
                                <span className="text-slate-500">Session:</span>{" "}
                                <b>{selectedClass?.session_key || "-"}</b>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            {clipUrl ? (
                              <video
                                controls
                                preload="metadata"
                                className="w-full rounded-xl"
                                src={clipUrl}
                              />
                            ) : (
                              <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
                                Không có clip
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {uploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold text-slate-900">
                  Upload video để auto inference
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Chọn lớp, chọn video, bấm OK để backend tạo job và worker tự chạy.
                </div>
              </div>

              <button
                type="button"
                onClick={closeUploadModal}
                disabled={isUploading}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">
                  Chọn lớp
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setUploadClassChoice("classroom_a")}
                    className={classOptionButton(uploadClassChoice === "classroom_a")}
                  >
                    <div className="font-semibold text-slate-900">Classroom A</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Upload video cho lớp A
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadClassChoice("classroom_b")}
                    className={classOptionButton(uploadClassChoice === "classroom_b")}
                  >
                    <div className="font-semibold text-slate-900">Classroom B</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Upload video cho lớp B
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">
                  Chọn video
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-left hover:bg-slate-100"
                >
                  <div className="text-sm font-medium text-slate-900">
                    {selectedUploadFile ? selectedUploadFile.name : "Bấm để chọn video"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Chấp nhận file video. Sau khi bấm OK, hệ thống sẽ tự inference.
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={isUploading}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void submitUpload()}
                disabled={isUploading || !selectedUploadFile}
                className="rounded-xl bg-[#114084] px-4 py-3 text-sm font-medium text-white hover:bg-[#0c3167] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploading ? "Đang upload..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}