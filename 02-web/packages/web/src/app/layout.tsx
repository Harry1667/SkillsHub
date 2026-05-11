import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skills Hub",
  description: "我的 AI Skills 私人書櫃",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
