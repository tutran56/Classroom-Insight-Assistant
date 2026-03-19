export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

type FetchOptions = RequestInit & {
  next?: NextFetchRequestConfig;
};

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const hasFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(!hasFormDataBody && options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    cache: options.cache ?? "no-store",
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;

    try {
      const data = await response.json();
      if (data?.detail) {
        message =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function toBackendAssetUrl(path?: string | null) {
  if (!path) return "";

  const raw = String(path).trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return `${API_BASE_URL}${raw}`;
  }

  return `${API_BASE_URL}/${raw}`;
}

/* =========================
 * Shared helpers for assets
 * ========================= */

export function getBestAnnotatedVideoUrl(
  result?: JobResultResponse | SessionItem | null
) {
  if (!result) return "";

  const assets =
    "assets" in result && result.assets ? result.assets : undefined;

  const directCandidates = [
    assets?.annotated_video_url,
    assets?.annotated_video_path,
    "annotated_video_url" in result ? result.annotated_video_url : null,
    "annotated_video_path" in result ? result.annotated_video_path : null,
  ];

  for (const candidate of directCandidates) {
    const url = toBackendAssetUrl(candidate ?? null);
    if (url) return url;
  }

  return "";
}

export function getClipUrl(
  clip?: JobClipItemResponse | JobPhoneSegmentResponse | BehaviorSegmentItem | null
) {
  if (!clip) return "";

  const candidates = [
    "clip_url" in clip ? clip.clip_url : null,
    "clip_path" in clip ? clip.clip_path : null,
  ];

  for (const candidate of candidates) {
    const url = toBackendAssetUrl(candidate ?? null);
    if (url) return url;
  }

  return "";
}

export function getTelegramClipUrl(
  item?:
    | TelegramLogItem
    | JobPhoneSegmentResponse
    | JobClipItemResponse
    | BehaviorSegmentItem
    | null
) {
  if (!item) return "";

  const candidates = [
    "clip_url" in item ? item.clip_url : null,
    "clip_path" in item ? item.clip_path : null,
  ];

  for (const candidate of candidates) {
    const url = toBackendAssetUrl(candidate ?? null);
    if (url) return url;
  }

  return "";
}

/* =========================
 * Screen 1 - Upload / Job
 * ========================= */

export type UploadJobResponse = {
  job_id: string;
  session_key: string;
  status: string;
};

export type JobStatusResponse = {
  job_id: string;
  session_key: string;
  status: string;
  progress?: number | null;
  message?: string | null;
  updated_at?: string | null;
  result_ready?: boolean | null;
  imported?: boolean | null;
  session_id?: number | null;
};

export type ResultSummary = {
  session_id?: string | null;
  job_id?: string | null;
  video_name?: string | null;
  video_duration_sec?: number | null;
  num_targets_locked?: number | null;
  num_frame_events?: number | null;
  num_phone_rows?: number | null;
  num_phone_segments?: number | null;
  num_phone_clips_ready?: number | null;
};

export type JobClipItemResponse = {
  target_id?: number | null;
  label?: string | null;
  start_sec?: number | null;
  end_sec?: number | null;
  duration_sec?: number | null;
  clip_file?: string | null;
  clip_path?: string | null;
  clip_url?: string | null;
};

export type JobPhoneSegmentResponse = {
  target_id?: number | null;
  label?: string | null;
  start_frame?: number | null;
  end_frame?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  duration_sec?: number | null;
  peak_conf?: number | null;
  avg_conf?: number | null;
  clip_file?: string | null;
  clip_path?: string | null;
  clip_url?: string | null;
};

export type JobEventPreviewResponse = {
  frame_idx?: number | null;
  time_sec?: number | null;
  target_id?: number | null;
  label?: string | null;
  confidence?: number | null;
};

export type JobAssetsResponse = {
  annotated_video_path?: string | null;
  annotated_video_url?: string | null;
  events_frame_csv_path?: string | null;
  events_frame_csv_url?: string | null;
  phone_segments_csv_path?: string | null;
  phone_segments_csv_url?: string | null;
  clips_dir?: string | null;
  clips_base_url?: string | null;
};

export type JobResultResponse = {
  job_id: string;
  session_key: string;
  session_id?: number | null;
  status?: string | null;
  summary?: ResultSummary | null;
  label_distribution?: Record<string, number> | null;
  assets?: JobAssetsResponse | null;
  phone_segments?: JobPhoneSegmentResponse[];
  clips?: JobClipItemResponse[];
  events_preview?: JobEventPreviewResponse[];
  result_json?: Record<string, unknown> | null;

  // backward-compatible helpers for older components
  annotated_video_url?: string | null;
  annotated_video_path?: string | null;
  events_csv_url?: string | null;
  events_csv_path?: string | null;
  phone_segments_csv_url?: string | null;
  phone_segments_csv_path?: string | null;
  clips_dir_url?: string | null;
  distribution?: { label: string; count: number }[];
};

export async function uploadJob(formData: FormData): Promise<UploadJobResponse> {
  const response = await fetch(`${API_BASE_URL}/jobs/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed: ${response.status} ${response.statusText}`;

    try {
      const data = await response.json();
      if (data?.detail) {
        message =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export function getJobStatus(jobId: string) {
  return apiFetch<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}/status`);
}

export async function getJobResult(jobId: string): Promise<JobResultResponse> {
  const raw = await apiFetch<JobResultResponse>(
    `/jobs/${encodeURIComponent(jobId)}/result`
  );

  const distribution =
    raw.distribution ||
    Object.entries(raw.label_distribution || {}).map(([label, count]) => ({
      label,
      count: Number(count || 0),
    }));

  return {
    ...raw,
    annotated_video_url: raw.annotated_video_url || raw.assets?.annotated_video_url || null,
    annotated_video_path:
      raw.annotated_video_path || raw.assets?.annotated_video_path || null,
    events_csv_url:
      raw.events_csv_url || raw.assets?.events_frame_csv_url || null,
    events_csv_path:
      raw.events_csv_path || raw.assets?.events_frame_csv_path || null,
    phone_segments_csv_url:
      raw.phone_segments_csv_url || raw.assets?.phone_segments_csv_url || null,
    phone_segments_csv_path:
      raw.phone_segments_csv_path || raw.assets?.phone_segments_csv_path || null,
    clips_dir_url: raw.clips_dir_url || raw.assets?.clips_base_url || null,
    distribution,
  };
}

/* =========================
 * Screen 2 - Dashboard
 * ========================= */

export type SessionItem = {
  id: number;
  class_name?: string | null;
  class_key?: string | null;
  session_key: string;
  video_name?: string | null;
  annotated_video_path?: string | null;
  annotated_video_url?: string | null;
  events_csv_path?: string | null;
  segments_csv_path?: string | null;
  result_json_path?: string | null;
  created_at?: string | null;
  imported_at?: string | null;
  overall_sentiment?: string | null;
  summary_text?: string | null;
};

export type SessionListResponse = {
  items: SessionItem[];
  total?: number;
};

export function getSessions() {
  return apiFetch<SessionListResponse>("/classes-db");
}

export function getValidClasses() {
  return apiFetch<SessionListResponse>("/classes-db/valid");
}

/* =========================
 * Screen 3 - Session Analysis
 * ========================= */

export type SessionDetailResponse = SessionItem;

export type BehaviorDistributionItem = {
  label: string;
  count: number;
};

export type BehaviorDistributionResponse = {
  session_id: number;
  class_name?: string | null;
  total_events?: number;
  positive_count?: number;
  negative_count?: number;
  positive_ratio?: number;
  negative_ratio?: number;
  items: BehaviorDistributionItem[];
};

export type BehaviorSegmentItem = {
  id?: number;
  session_id: number;
  segment_id: string;
  target_id: number;
  label: string;
  start_time_sec: number;
  end_time_sec: number;
  duration_sec?: number | null;
  peak_conf?: number | null;
  mean_conf?: number | null;
  clip_start_sec?: number | null;
  clip_end_sec?: number | null;
  clip_path?: string | null;
  clip_url?: string | null;
  telegram_ready?: boolean | null;
  telegram_sent?: boolean | null;
  telegram_sent_at?: string | null;
};

export type BehaviorSegmentListResponse = {
  session_id: number;
  class_name?: string | null;
  total: number;
  items: BehaviorSegmentItem[];
};

export type TopPhoneWindowResponse = {
  session_id: number;
  class_name?: string | null;
  window_sec: number;
  window_start_sec: number;
  window_end_sec: number;
  distinct_target_count: number;
  event_count: number;
  target_ids: number[];
  label: string;
};

export type TopNegativeWindowResponse = {
  session_id: number;
  class_name?: string | null;
  window_sec?: number;
  window_start_sec: number;
  window_end_sec: number;
  negative_score: number;
  breakdown: {
    using_phone: number;
    sleeping: number;
    turning: number;
  };
};

export type AICommentaryResponse = {
  session_id: number;
  class_name?: string | null;
  overall_sentiment: string;
  summary_text: string;
  highlights: string[];
  suggestion: string;
  fallback_reason?: string | null;
};

export type PromptSearchMatch = {
  type?: string | null;
  label?: string | null;
  target_id?: number | null;
  time_sec?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  score?: number | null;
  reason?: string | null;
};

export type PromptSearchResponse = {
  session_id?: number;
  query?: string;
  answer: string;
  seek_time_sec: number | null;
  parsed_intent?: Record<string, unknown> | null;
  matches?: PromptSearchMatch[];
  matched_targets?: number[];
  matched_labels?: string[];
  raw?: Record<string, unknown> | null;
};

export function getSessionDetail(sessionId: number) {
  return apiFetch<SessionDetailResponse>(`/classes-db/${sessionId}`);
}

export function getBehaviorDistribution(sessionId: number) {
  return apiFetch<BehaviorDistributionResponse>(
    `/classes-db/${sessionId}/behavior-distribution`
  );
}

export function getBehaviorSegments(sessionId: number) {
  return apiFetch<BehaviorSegmentListResponse>(
    `/classes-db/${sessionId}/segments`
  );
}

export function getTopPhoneWindow(sessionId: number, windowSec = 5) {
  return apiFetch<TopPhoneWindowResponse>(
    `/classes-db/${sessionId}/top-phone-window?window_sec=${windowSec}`
  );
}

export function getTopNegativeWindow(sessionId: number, windowSec = 5) {
  return apiFetch<TopNegativeWindowResponse>(
    `/classes-db/${sessionId}/top-negative-window?window_sec=${windowSec}`
  );
}

export function getAICommentary(sessionId: number) {
  return apiFetch<AICommentaryResponse>(
    `/classes-db/${sessionId}/ai-commentary`
  );
}

export function promptSearchSession(sessionId: number, query: string) {
  return apiFetch<PromptSearchResponse>(
    `/classes-db/${sessionId}/prompt-search`,
    {
      method: "POST",
      body: JSON.stringify({ query }),
    }
  );
}

export function searchSessionByPrompt(sessionId: number, query: string) {
  return promptSearchSession(sessionId, query);
}

/* =========================
 * Screen 4 - Telegram
 * ========================= */

export type TelegramLogItem = {
  id?: number;
  session_id: number;
  segment_id?: string | null;
  target_id?: number | null;
  label?: string | null;
  clip_path?: string | null;
  clip_url?: string | null;
  status?: string | null;
  message?: string | null;
  sent_at?: string | null;
};

export type TelegramLogListResponse = {
  session_id: number;
  class_name?: string | null;
  total: number;
  items: TelegramLogItem[];
};

export type SeedTelegramLogsResponse = {
  session_id: number;
  class_name?: string | null;
  inserted_logs: number;
  message: string;
};

export function getTelegramLogs(sessionId: number) {
  return apiFetch<TelegramLogListResponse>(
    `/classes-db/${sessionId}/telegram-logs`
  );
}

export function seedTelegramLogs(sessionId: number) {
  return apiFetch<SeedTelegramLogsResponse>(
    `/classes-db/${sessionId}/seed-telegram-logs`,
    {
      method: "POST",
    }
  );
}