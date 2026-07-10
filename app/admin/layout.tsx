import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/auth/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();
  return children;
}
