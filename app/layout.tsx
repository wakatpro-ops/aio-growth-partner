import type { Metadata } from "next";
import { AuthHashHandler } from "@/components/auth/auth-hash-handler";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIO Growth Partner",
  description: "店舗業務効率化とAIO支援の共通SaaS基盤"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
