import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Warehouse System",
  description: "Warehouse rental MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
          <header className="border-b border-zinc-200 bg-white">
            <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-4 px-4 py-3 text-sm">
              <Link href="/" className="font-semibold">
                Warehouse System
              </Link>
              <Link href="/dev-login" className="text-zinc-700 hover:text-zinc-900">
                Dev Login
              </Link>
              <Link href="/catalog" className="text-zinc-700 hover:text-zinc-900">
                Catalog
              </Link>
              <Link href="/orders/new" className="text-zinc-700 hover:text-zinc-900">
                New Order
              </Link>
              <Link href="/my-orders" className="text-zinc-700 hover:text-zinc-900">
                My Orders
              </Link>
              <Link href="/warehouse/queue" className="text-zinc-700 hover:text-zinc-900">
                Warehouse Queue
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
