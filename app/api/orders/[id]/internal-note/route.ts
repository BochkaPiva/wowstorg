import { OrderStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.SUBMITTED,
  OrderStatus.APPROVED,
  OrderStatus.ISSUED,
  OrderStatus.RETURN_DECLARED,
];

type Params = { params: Promise<{ id: string }> };

function parseNote(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body.trim() || null;
  if (typeof body === "object" && body !== null && "note" in body) {
    const v = (body as { note: unknown }).note;
    if (v === undefined || v === null) return null;
    return typeof v === "string" ? v.trim() || null : null;
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.WAREHOUSE && auth.user.role !== Role.ADMIN) {
    return fail(403, "Only warehouse/admin can set internal note.");
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!order) return fail(404, "Order not found.");
  if (!ACTIVE_STATUSES.includes(order.status)) {
    return fail(409, "Internal note can be set only for active orders.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const note = parseNote(body);
  if (note !== null && note.length > 2000) {
    return fail(400, "Note is too long.");
  }

  await prisma.order.update({
    where: { id },
    data: { warehouseInternalNote: note },
  });

  return NextResponse.json({ ok: true, note });
}
