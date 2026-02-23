import { ItemType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import {
  parseCheckinInput,
  requiresCheckin,
  serializeOrder,
  toAvailabilityStatus,
  toIncidentType,
} from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

type Severity = "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";

const severityRank: Record<Severity, number> = {
  ACTIVE: 0,
  NEEDS_REPAIR: 1,
  BROKEN: 2,
  MISSING: 3,
};

function maxSeverity(current: Severity, next: Severity): Severity {
  return severityRank[next] > severityRank[current] ? next : current;
}

export async function POST(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parseCheckinInput(body);
  if (!parsed) {
    return fail(400, "Invalid check-in payload.");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: {
          item: true,
        },
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.status === "CLOSED") {
    const closed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
    return NextResponse.json({ order: serializeOrder(closed) });
  }

  if (order.status !== "RETURN_DECLARED" && order.status !== "ISSUED") {
    return fail(409, "Check-in is allowed only in RETURN_DECLARED or ISSUED status.");
  }

  const requiredLines = order.lines.filter((line) => requiresCheckin(line.item.itemType));
  const inputByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line]));

  for (const line of requiredLines) {
    if (!inputByLineId.has(line.id)) {
      return fail(400, "Missing check-in line for required order line.", {
        orderLineId: line.id,
      });
    }
  }

  for (const provided of parsed.lines) {
    const line = order.lines.find((entry) => entry.id === provided.orderLineId);
    if (!line) {
      return fail(400, "Unknown order line in check-in payload.", {
        orderLineId: provided.orderLineId,
      });
    }

    if (line.item.itemType === ItemType.CONSUMABLE) {
      return fail(400, "CONSUMABLE lines must not be included in check-in.");
    }

    const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
    if (provided.returnedQty > issuedQty) {
      return fail(400, "returnedQty cannot exceed issued quantity.", {
        orderLineId: line.id,
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextItemSeverity = new Map<string, Severity>();

    for (const provided of parsed.lines) {
      const line = order.lines.find((entry) => entry.id === provided.orderLineId)!;
      const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const missingAmount = Math.max(0, issuedQty - provided.returnedQty);

      await tx.checkinLine.upsert({
        where: { orderLineId: line.id },
        update: {
          returnedQty: provided.returnedQty,
          condition: provided.condition,
          comment: provided.comment ?? null,
          createdById: auth.user.id,
        },
        create: {
          orderLineId: line.id,
          createdById: auth.user.id,
          returnedQty: provided.returnedQty,
          condition: provided.condition,
          comment: provided.comment ?? null,
        },
      });

      if (line.item.itemType === ItemType.BULK && missingAmount > 0) {
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            stockTotal: { decrement: missingAmount },
          },
        });
      }

      const incidentType = toIncidentType(provided.condition);
      if (incidentType) {
        await tx.incident.create({
          data: {
            itemId: line.itemId,
            orderId: order.id,
            orderLineId: line.id,
            type: incidentType,
            description: provided.comment ?? null,
            createdById: auth.user.id,
          },
        });

        const status = toAvailabilityStatus(provided.condition);
        if (status) {
          const severity = status as Severity;
          nextItemSeverity.set(
            line.itemId,
            maxSeverity(nextItemSeverity.get(line.itemId) ?? "ACTIVE", severity),
          );
        }
      }
    }

    for (const [itemId, severity] of nextItemSeverity) {
      await tx.item.update({
        where: { id: itemId },
        data: { availabilityStatus: severity },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CLOSED",
        returnDeclaredAt: order.returnDeclaredAt ?? new Date(),
        closedAt: new Date(),
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
