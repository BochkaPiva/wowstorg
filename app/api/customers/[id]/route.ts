import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const current = await prisma.customer.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "Customer not found.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object") {
    return fail(400, "Invalid payload.");
  }

  const payload = body as Record<string, unknown>;
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      name:
        typeof payload.name === "string" && payload.name.trim().length > 0
          ? payload.name.trim()
          : current.name,
      contact:
        payload.contact === null
          ? null
          : typeof payload.contact === "string"
            ? payload.contact.trim()
            : current.contact,
      notes:
        payload.notes === null
          ? null
          : typeof payload.notes === "string"
            ? payload.notes.trim()
            : current.notes,
      isActive:
        typeof payload.isActive === "boolean" ? payload.isActive : current.isActive,
    },
  });

  return NextResponse.json({
    customer: {
      id: updated.id,
      name: updated.name,
      contact: updated.contact,
      notes: updated.notes,
      isActive: updated.isActive,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const current = await prisma.customer.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "Customer not found.");
  }

  await prisma.customer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
