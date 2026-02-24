import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import SwipeBack from "@/app/components/SwipeBack";
import TopNavMenu from "@/app/components/TopNavMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WowStorg Hub",
  description: "Система аренды и выдачи реквизита",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SwipeBack />
        <div className="min-h-screen text-zinc-900">
          <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 text-sm">
              <Link href="/" className="font-semibold text-[var(--brand)]">
                WowStorg Hub
              </Link>
              <Suspense fallback={null}>
                <TopNavMenu />
              </Suspense>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
