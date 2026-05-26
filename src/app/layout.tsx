import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CardMaster Pro — 卡牌買取系統",
  description: "AI-powered TCG buyback system with Shopify, SNKRDUNK & Telegram approval",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-HK">
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
