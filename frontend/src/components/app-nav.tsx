"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  description: string;
  match: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/upload",
    label: "Upload",
    description: "Upload video và theo dõi job",
    match: (pathname) =>
      pathname === "/" ||
      pathname === "/upload" ||
      pathname.startsWith("/upload/"),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Danh sách session theo lớp",
    match: (pathname) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/"),
  },
  {
    href: "/sessions",
    label: "Session Analysis",
    description: "Phân tích chi tiết theo session",
    match: (pathname) =>
      pathname === "/sessions" || pathname.startsWith("/sessions/"),
  },
  {
    href: "/telegram",
    label: "Telegram",
    description: "Preview, log và gửi cảnh báo",
    match: (pathname) =>
      pathname === "/telegram" || pathname.startsWith("/telegram/"),
  },
];

function getPageTitle(pathname: string) {
  if (pathname === "/" || pathname === "/upload" || pathname.startsWith("/upload/")) {
    return "Upload";
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "Dashboard";
  }

  if (pathname === "/sessions" || pathname.startsWith("/sessions/")) {
    return "Session Analysis";
  }

  if (pathname === "/telegram" || pathname.startsWith("/telegram/")) {
    return "Telegram";
  }

  return "AI Classroom Behavior Analysis";
}

function getPageSubtitle(pathname: string, sessionKey?: string | null) {
  if (pathname === "/" || pathname === "/upload" || pathname.startsWith("/upload/")) {
    return "Upload video, tạo job và xem nhanh kết quả inference mới nhất.";
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "Theo dõi session theo lớp học và mở phân tích chi tiết.";
  }

  if (pathname === "/sessions" || pathname.startsWith("/sessions/")) {
    if (sessionKey) {
      return `Đang phân tích session: ${sessionKey}`;
    }

    return "Xem video annotated, summary, segments, commentary và prompt search.";
  }

  if (pathname === "/telegram" || pathname.startsWith("/telegram/")) {
    if (sessionKey) {
      return `Theo dõi Telegram flow cho session: ${sessionKey}`;
    }

    return "Xem log gửi, preview cảnh báo và chuẩn bị teacher alert flow.";
  }

  return "Upload • Dashboard • Session Analysis • Telegram";
}

function getSessionKeyFromPath(pathname: string) {
  const match = pathname.match(/^\/sessions\/([^/]+)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function AppNav() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const sessionKeyFromPath = getSessionKeyFromPath(pathname);
  const sessionKeyFromQuery = searchParams.get("sessionKey");
  const sessionKey = sessionKeyFromPath || sessionKeyFromQuery;

  const activeItem = useMemo(() => {
    return NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
  }, [pathname]);

  const pageTitle = activeItem?.label ?? getPageTitle(pathname);
  const pageSubtitle = getPageSubtitle(pathname, sessionKey);

  return (
    <div className="mb-8 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold text-slate-900">
              AI Classroom Behavior Analysis
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {pageTitle}
            </span>
          </div>

          <div className="mt-2 text-sm text-slate-500">{pageSubtitle}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);

            const href =
              item.href === "/sessions"
                ? sessionKey
                  ? `/sessions/${encodeURIComponent(sessionKey)}`
                  : "/dashboard"
                : item.href === "/telegram"
                ? sessionKey
                  ? `/telegram?sessionKey=${encodeURIComponent(sessionKey)}`
                  : "/telegram"
                : item.href;

            return (
              <Link
                key={item.label}
                href={href}
                aria-current={active ? "page" : undefined}
                title={item.description}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[#1f4f95] text-white"
                    : "border bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
