import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { notifyWarehouseAboutReturnDeclared } from "@/lib/notifications";
import { serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

type ClientReturnSegment = { condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING"; qty: number };
type ClientReturnLine = {
  orderLineId: string;
  returnedQty: number;
  condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
  comment?: string;
  /** Когда задано, returnedQty/condition игнорируются при сохранении в chunk; в chunk пишем segments. */
  segments?: ClientReturnSegment[];
};

const CLIENT_DECLARATION_MARKER = "CLIENT_RETURN_DECLARATION_B64:";

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
    const segmentsRaw = line.segments;
    if (Array.isArray(segmentsRaw) && segmentsRaw.length > 0) {
      const segments: ClientReturnSegment[] = [];
      for (const s of segmentsRaw) {
        if (!s || typeof s !== "object") return null;
        const seg = s as Record<string, unknown>;
        const qty = typeof seg.qty === "number" && Number.isInteger(seg.qty) && seg.qty >= 0 ? seg.qty : null;
        if (qty === null || typeof seg.condition !== "string" || !allowed.has(seg.condition)) return null;
        segments.push({ condition: seg.condition as ClientReturnSegment["condition"], qty });
      }
      const sum = segments.reduce((a, x) => a + x.qty, 0);
      if (sum === 0) return null;
      lines.push({
        orderLineId: line.orderLineId.trim(),
        returnedQty: segments[0]!.qty,
        condition: segments[0]!.condition,
        comment: typeof line.comment === "string" && line.comment.trim().length > 0 ? line.comment.trim() : undefined,
        segments,
      });
      continue;
    }
    const returnedQty = typeof line.returnedQty === "number" && Number.isInteger(line.returnedQty) && line.returnedQty >= 0 ? line.returnedQty : null;
    if (returnedQty === null || typeof line.condition !== "string" || !allowed.has(line.condition)) return null;
    lines.push({
      orderLineId: line.orderLineId.trim(),
      returnedQty,
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
      if (line.segments) {
        const sum = line.segments.reduce((a, s) => a + s.qty, 0);
        if (sum !== issuedQty) {
          return fail(400, "Sum of segments must equal issued quantity.", { orderLineId: line.orderLineId });
        }
      } else if (line.returnedQty > issuedQty) {
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
            if (line.segments && line.segments.length > 0) {
              return `- ${orderLine.itemId}: ${line.segments.map((s) => `${s.qty} шт — ${s.condition}`).join(", ")} из ${issuedQty}${line.comment ? ` (${line.comment})` : ""}`;
            }
            return `- ${orderLine.itemId}: сдано ${line.returnedQty} из ${issuedQty}, статус ${line.condition}${line.comment ? ` (${line.comment})` : ""}`;
          }),
          declaration.comment ? `Комментарий клиента: ${declaration.comment}` : "",
        ]
          .filter((entry) => entry.length > 0)
          .join("\n")
      : declaration?.comment
        ? `Комментарий клиента: ${declaration.comment}`
        : null;

  const declarationMachineChunk =
    declaration && declaration.lines.length > 0
      ? `${CLIENT_DECLARATION_MARKER}${Buffer.from(
          JSON.stringify({
            createdAt: new Date().toISOString(),
            lines: declaration.lines.map((line) => {
              const orderLine = lineMap.get(line.orderLineId)!;
              const issuedQty = orderLine.issuedQty ?? orderLine.approvedQty ?? orderLine.requestedQty;
              const base = {
                orderLineId: line.orderLineId,
                itemId: orderLine.itemId,
                issuedQty,
                comment: line.comment ?? null,
              };
              if (line.segments && line.segments.length > 0) {
                return { ...base, segments: line.segments };
              }
              return {
                ...base,
                returnedQty: line.returnedQty,
                condition: line.condition,
              };
            }),
            comment: declaration.comment ?? null,
          }),
          "utf8",
        ).toString("base64")}`
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "RETURN_DECLARED",
        returnDeclaredAt: new Date(),
        notes:
          declarationText || declarationMachineChunk
            ? [
                order.notes ?? "",
                declarationText ?? "",
                declarationMachineChunk ?? "",
              ]
                .filter((entry) => entry.length > 0)
                .join("\n")
            : order.notes,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  await notifyWarehouseAboutReturnDeclared({
    orderId: updated.id,
    customerName: updated.customer?.name ?? null,
    startDate: updated.startDate.toISOString().slice(0, 10),
    endDate: updated.endDate.toISOString().slice(0, 10),
    eventName: updated.eventName ?? null,
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
