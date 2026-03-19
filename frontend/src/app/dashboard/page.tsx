import DashboardShell from "@/components/dashboard-shell";
import { getSessions } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getSessions();
  const items = data?.items ?? [];

  return <DashboardShell classes={items} />;
}