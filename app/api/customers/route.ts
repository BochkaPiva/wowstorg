import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

  const customers = await prisma.customer.findMany({
    where: {
      isActive: includeInactive ? undefined : true,
      name: search
        ? {
            contains: search,
            mode: "insensitive",
          }
        : undefined,
    },
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      contact: customer.contact,
      notes: customer.notes,
      isActive: customer.isActive,
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
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
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return fail(400, "name is required.");
  }

  const customer = await prisma.customer.upsert({
    where: { name: payload.name.trim() },
    update: {
      contact:
        typeof payload.contact === "string" && payload.contact.trim().length > 0
          ? payload.contact.trim()
          : null,
      notes:
        typeof payload.notes === "string" && payload.notes.trim().length > 0
          ? payload.notes.trim()
          : null,
      isActive: payload.isActive === false ? false : true,
    },
    create: {
      name: payload.name.trim(),
      contact:
        typeof payload.contact === "string" && payload.contact.trim().length > 0
          ? payload.contact.trim()
          : null,
      notes:
        typeof payload.notes === "string" && payload.notes.trim().length > 0
          ? payload.notes.trim()
          : null,
      isActive: payload.isActive === false ? false : true,
    },
  });

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      contact: customer.contact,
      notes: customer.notes,
      isActive: customer.isActive,
    },
  });
}
