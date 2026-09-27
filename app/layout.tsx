import type { Metadata } from "next";
import { AuthHashHandler } from "@/components/auth/auth-hash-handler";
import { StoreAiWorkspace } from "@/components/store-ai/store-ai-workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIO boost",
  description: "店舗業務効率化とAIO支援の共通SaaS基盤"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AuthHashHandler />
        {children}
        <StoreAiWorkspace />
      </body>
    </html>
  );
}
