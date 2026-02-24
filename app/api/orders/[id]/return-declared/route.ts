import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

type ClientReturnLine = {
  orderLineId: string;
  returnedQty: number;
  condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
  comment?: string;
};

function parseClientDeclaration(
  body: unknown,
): { lines: ClientReturnLine[]; comment?: string } | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  const linesRaw = payload.lines;
  if (!Array.isArray(linesRaw)) {
    return { lines: [], comment: typeof payload.comment === "string" ? payload.comment.trim() : undefined };
  }

  const allowed = new Set(["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"]);
  const lines: ClientReturnLine[] = [];
  for (const lineRaw of linesRaw) {
    if (!lineRaw || typeof lineRaw !== "object") return null;
    const line = lineRaw as Record<string, unknown>;
    if (typeof line.orderLineId !== "string" || line.orderLineId.trim().length === 0) return null;
    if (typeof line.returnedQty !== "number" || !Number.isInteger(line.returnedQty) || line.returnedQty < 0) return null;
    if (typeof line.condition !== "string" || !allowed.has(line.condition)) return null;
    lines.push({
      orderLineId: line.orderLineId.trim(),
      returnedQty: line.returnedQty,
      condition: line.condition as ClientReturnLine["condition"],
      comment: typeof line.comment === "string" && line.comment.trim().length > 0 ? line.comment.trim() : undefined,
    });
  }

  return {
    lines,
    comment: typeof payload.comment === "string" && payload.comment.trim().length > 0 ? payload.comment.trim() : undefined,
  };
}

export async function POST(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.user.role !== Role.GREENWICH) {
    return fail(403, "Only Greenwich users can declare return.");
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.createdById !== auth.user.id) {
    return fail(403, "Forbidden.");
  }

  if (order.status === "RETURN_DECLARED") {
    return NextResponse.json({ order: serializeOrder(order) });
  }

  if (order.status !== "ISSUED") {
    return fail(409, "Return can be declared only for ISSUED orders.");
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const declaration = parseClientDeclaration(body);
  if (body && declaration === null) {
    return fail(400, "Invalid return declaration payload.");
  }

  const lineMap = new Map(order.lines.map((line) => [line.id, line]));
  if (declaration && declaration.lines.length > 0) {
    for (const line of declaration.lines) {
      const orderLine = lineMap.get(line.orderLineId);
      if (!orderLine) {
        return fail(400, "Unknown order line in return declaration.", { orderLineId: line.orderLineId });
      }
      const issuedQty = orderLine.issuedQty ?? orderLine.approvedQty ?? orderLine.requestedQty;
      if (line.returnedQty > issuedQty) {
        return fail(400, "returnedQty cannot exceed issued quantity.", { orderLineId: line.orderLineId });
      }
    }
  }

  const declarationText =
    declaration && declaration.lines.length > 0
      ? [
          "Декларация клиента по возврату:",
          ...declaration.lines.map((line) => {
            const orderLine = lineMap.get(line.orderLineId)!;
            const issuedQty = orderLine.issuedQty ?? orderLine.approvedQty ?? orderLine.requestedQty;
            return `- ${orderLine.itemId}: сдано ${line.returnedQty} из ${issuedQty}, статус ${line.condition}${line.comment ? ` (${line.comment})` : ""}`;
          }),
          declaration.comment ? `Комментарий клиента: ${declaration.comment}` : "",
        ]
          .filter((entry) => entry.length > 0)
          .join("\n")
      : declaration?.comment
        ? `Комментарий клиента: ${declaration.comment}`
        : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "RETURN_DECLARED",
        returnDeclaredAt: new Date(),
        notes: declarationText ? `${order.notes ? `${order.notes}\n` : ""}${declarationText}` : order.notes,
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
