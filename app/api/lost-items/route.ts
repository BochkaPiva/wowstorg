import { LostItemStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

function parseStatus(raw: string | null): LostItemStatus | null {
  if (!raw) return null;
  if (raw === LostItemStatus.OPEN || raw === LostItemStatus.FOUND || raw === LostItemStatus.WRITTEN_OFF) {
    return raw;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;
  const status = parseStatus(params.get("status"));
  if (params.get("status") && !status) {
    return fail(400, "Invalid lost item status.");
  }

  const search = params.get("search")?.trim() ?? "";
  const requestedLimit = Number(params.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(1, requestedLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rows = await prisma.lostItem.findMany({
    where: {
      status: status ?? undefined,
      OR:
        search.length > 0
          ? [
              { item: { name: { contains: search, mode: "insensitive" } } },
              { customerNameSnapshot: { contains: search, mode: "insensitive" } },
              { eventNameSnapshot: { contains: search, mode: "insensitive" } },
              { customerTelegramId: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
    },
    include: {
      item: { select: { id: true, name: true } },
      order: { select: { id: true } },
      detectedBy: { select: { id: true, username: true, telegramId: true } },
      resolvedBy: { select: { id: true, username: true, telegramId: true } },
    },
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({
    lostItems: rows.map((row) => ({
      id: row.id,
      status: row.status,
      item: {
        id: row.item.id,
        name: row.item.name,
      },
      orderId: row.order.id,
      lostQty: row.lostQty,
      customerTelegramId: row.customerTelegramId,
      customerNameSnapshot: row.customerNameSnapshot,
      eventNameSnapshot: row.eventNameSnapshot,
      note: row.note,
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      detectedBy: {
        id: row.detectedBy.id,
        username: row.detectedBy.username,
        telegramId: row.detectedBy.telegramId.toString(),
      },
      resolvedBy: row.resolvedBy
        ? {
            id: row.resolvedBy.id,
            username: row.resolvedBy.username,
            telegramId: row.resolvedBy.telegramId.toString(),
          }
        : null,
    })),
  });
}
