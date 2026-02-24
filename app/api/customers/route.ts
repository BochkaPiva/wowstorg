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
    customers: await Promise.all(
      customers.map(async (customer) => {
        const orders = await prisma.order.findMany({
          where: { customerId: customer.id },
          select: {
            startDate: true,
            endDate: true,
            lines: {
              select: {
                requestedQty: true,
                approvedQty: true,
                issuedQty: true,
                pricePerDaySnapshot: true,
              },
            },
          },
        });
        let ltv = 0;
        for (const order of orders) {
          const days = Math.max(
            1,
            Math.ceil(
              (order.endDate.getTime() - order.startDate.getTime()) / (24 * 60 * 60 * 1000),
            ),
          );
          for (const line of order.lines) {
            const qty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
            ltv += qty * Number(line.pricePerDaySnapshot) * days;
          }
        }
        return {
          id: customer.id,
          name: customer.name,
          contact: customer.contact,
          notes: customer.notes,
          isActive: customer.isActive,
          ltv,
          ordersCount: orders.length,
        };
      }),
    ),
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
