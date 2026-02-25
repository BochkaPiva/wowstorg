import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.WAREHOUSE) {
    return fail(403, "Only ADMIN or WAREHOUSE can manage internal consumables.");
  }

  const { id } = await params;
  const current = await prisma.internalConsumable.findUnique({ where: { id } });
  if (!current) return fail(404, "Not found.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON.");
  }
  const payload = body as Record<string, unknown>;
  const action = payload.action;
  if (action !== "increase" && action !== "decrease") {
    return fail(400, "action must be 'increase' or 'decrease'.");
  }

  if (action === "decrease") {
    const nextQty = Math.max(0, current.quantity - 1);
    const updated = await prisma.internalConsumable.update({
      where: { id },
      data: { quantity: nextQty },
    });
    return NextResponse.json({
      item: { id: updated.id, name: updated.name, quantity: updated.quantity, updatedAt: updated.updatedAt.toISOString() },
    });
  }

  const amount =
    typeof payload.amount === "number" && Number.isInteger(payload.amount) && payload.amount >= 0
      ? payload.amount
      : 1;
  const updated = await prisma.internalConsumable.update({
    where: { id },
    data: { quantity: current.quantity + amount },
  });
  return NextResponse.json({
    item: { id: updated.id, name: updated.name, quantity: updated.quantity, updatedAt: updated.updatedAt.toISOString() },
  });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.WAREHOUSE) {
    return fail(403, "Only ADMIN or WAREHOUSE can manage internal consumables.");
  }

  const { id } = await params;
  const existing = await prisma.internalConsumable.findUnique({ where: { id } });
  if (!existing) return fail(404, "Not found.");
  await prisma.internalConsumable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
