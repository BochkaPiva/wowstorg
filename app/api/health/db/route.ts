import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health/db — проверка подключения к БД без авторизации.
 * Если открыть в браузере или curl, покажет ok: true или ошибку с кодом Prisma.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    const message =
      e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
    return NextResponse.json(
      { ok: false, code: code || "UNKNOWN", message: message || "DB error" },
      { status: 503 },
    );
  }
}
