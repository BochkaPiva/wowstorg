import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import SwipeBack from "@/app/components/SwipeBack";
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
            <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-4 px-4 py-3 text-sm">
              <Link href="/" className="font-semibold text-[var(--brand)]">
                WowStorg Hub
              </Link>
              <Link href="/dev-login" className="text-zinc-700 hover:text-zinc-900">
                Dev-вход
              </Link>
              <Link href="/catalog" className="text-zinc-700 hover:text-zinc-900">
                Каталог
              </Link>
              <Link href="/my-orders" className="text-zinc-700 hover:text-zinc-900">
                Мои заявки
              </Link>
              <Link href="/warehouse/queue" className="text-zinc-700 hover:text-zinc-900">
                Очередь склада
              </Link>
              <Link href="/warehouse/archive" className="text-zinc-700 hover:text-zinc-900">
                Архив
              </Link>
              <Link href="/admin" className="text-zinc-700 hover:text-zinc-900">
                Админ
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
