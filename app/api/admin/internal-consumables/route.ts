import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.ADMIN) {
    return fail(403, "Only ADMIN can manage internal consumables.");
  }

  const rows = await prisma.internalConsumable.findMany({
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.ADMIN) {
    return fail(403, "Only ADMIN can manage internal consumables.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON.");
  }
  const payload = body as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return fail(400, "name is required.");
  }
  const quantity =
    typeof payload.quantity === "number" && Number.isInteger(payload.quantity) && payload.quantity >= 0
      ? payload.quantity
      : 0;

  const created = await prisma.internalConsumable.create({
    data: { name, quantity },
  });

  return NextResponse.json({
    item: {
      id: created.id,
      name: created.name,
      quantity: created.quantity,
      updatedAt: created.updatedAt.toISOString(),
    },
  });
}
