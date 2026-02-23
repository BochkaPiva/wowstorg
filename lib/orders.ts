import {
  AvailabilityStatus,
  CheckinCondition,
  IncidentType,
  ItemType,
  OrderStatus,
  Prisma,
  type Order,
  type OrderLine,
} from "@prisma/client";

export type CreateOrderLineInput = {
  itemId: string;
  requestedQty: number;
  sourceKitId?: string | null;
};

export type CreateOrderInput = {
  startDate: string;
  endDate: string;
  pickupTime?: string | null;
  notes?: string | null;
  isEmergency?: boolean;
  lines: CreateOrderLineInput[];
};

export type PatchOrderInput = {
  startDate?: string;
  endDate?: string;
  pickupTime?: string | null;
  notes?: string | null;
  lines?: CreateOrderLineInput[];
};

export type ApproveOrderInput = {
  lines: Array<{
    orderLineId: string;
    approvedQty: number;
  }>;
};

export type IssueOrderInput = {
  lines: Array<{
    orderLineId: string;
    issuedQty: number;
  }>;
};

export type CheckinOrderInput = {
  lines: Array<{
    orderLineId: string;
    returnedQty: number;
    condition: CheckinCondition;
    comment?: string | null;
  }>;
};

export function parseDateOnlyOrNull(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim();
}

function parseRequiredDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value <= 0) {
    return null;
  }
  return value;
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0) {
    return null;
  }
  return value;
}

export function parseCreateOrderInput(body: unknown): CreateOrderInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const startDate = parseRequiredDate(payload.startDate);
  const endDate = parseRequiredDate(payload.endDate);
  const linesRaw = payload.lines;

  if (!startDate || !endDate || !Array.isArray(linesRaw) || linesRaw.length === 0) {
    return null;
  }

  const lines: CreateOrderLineInput[] = [];
  for (const lineRaw of linesRaw) {
    if (!lineRaw || typeof lineRaw !== "object") {
      return null;
    }

    const line = lineRaw as Record<string, unknown>;
    if (typeof line.itemId !== "string" || line.itemId.trim().length === 0) {
      return null;
    }

    const requestedQty = parsePositiveInt(line.requestedQty);
    if (!requestedQty) {
      return null;
    }

    lines.push({
      itemId: line.itemId.trim(),
      requestedQty,
      sourceKitId:
        typeof line.sourceKitId === "string" && line.sourceKitId.trim().length > 0
          ? line.sourceKitId.trim()
          : null,
    });
  }

  return {
    startDate,
    endDate,
    pickupTime: parseOptionalString(payload.pickupTime),
    notes: parseOptionalString(payload.notes),
    isEmergency: payload.isEmergency === true,
    lines,
  };
}

export function parsePatchOrderInput(body: unknown): PatchOrderInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const output: PatchOrderInput = {};

  if (payload.startDate !== undefined) {
    const startDate = parseRequiredDate(payload.startDate);
    if (!startDate) {
      return null;
    }
    output.startDate = startDate;
  }

  if (payload.endDate !== undefined) {
    const endDate = parseRequiredDate(payload.endDate);
    if (!endDate) {
      return null;
    }
    output.endDate = endDate;
  }

  if (payload.pickupTime !== undefined) {
    output.pickupTime = parseOptionalString(payload.pickupTime);
  }

  if (payload.notes !== undefined) {
    output.notes = parseOptionalString(payload.notes);
  }

  if (payload.lines !== undefined) {
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      return null;
    }

    const lines: CreateOrderLineInput[] = [];
    for (const lineRaw of payload.lines) {
      if (!lineRaw || typeof lineRaw !== "object") {
        return null;
      }
      const line = lineRaw as Record<string, unknown>;
      if (typeof line.itemId !== "string" || line.itemId.trim().length === 0) {
        return null;
      }
      const requestedQty = parsePositiveInt(line.requestedQty);
      if (!requestedQty) {
        return null;
      }

      lines.push({
        itemId: line.itemId.trim(),
        requestedQty,
        sourceKitId:
          typeof line.sourceKitId === "string" && line.sourceKitId.trim().length > 0
            ? line.sourceKitId.trim()
            : null,
      });
    }
    output.lines = lines;
  }

  if (Object.keys(output).length === 0) {
    return null;
  }

  return output;
}

export function validateDateRange(startRaw: string, endRaw: string): {
  ok: true;
  startDate: Date;
  endDate: Date;
} | {
  ok: false;
  message: string;
} {
  const startDate = parseDateOnlyOrNull(startRaw);
  const endDate = parseDateOnlyOrNull(endRaw);

  if (!startDate || !endDate) {
    return { ok: false, message: "Dates must be in YYYY-MM-DD format." };
  }

  if (startDate >= endDate) {
    return { ok: false, message: "endDate must be greater than startDate." };
  }

  return { ok: true, startDate, endDate };
}

export function parseApproveInput(body: unknown): ApproveOrderInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return null;
  }

  const lines = payload.lines.map((lineRaw) => {
    if (!lineRaw || typeof lineRaw !== "object") {
      return null;
    }
    const line = lineRaw as Record<string, unknown>;
    if (typeof line.orderLineId !== "string" || line.orderLineId.trim().length === 0) {
      return null;
    }
    const approvedQty = parseNonNegativeInt(line.approvedQty);
    if (approvedQty === null) {
      return null;
    }
    return {
      orderLineId: line.orderLineId.trim(),
      approvedQty,
    };
  });

  if (lines.some((line) => line === null)) {
    return null;
  }

  return { lines: lines as ApproveOrderInput["lines"] };
}

export function parseIssueInput(body: unknown): IssueOrderInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return null;
  }

  const lines = payload.lines.map((lineRaw) => {
    if (!lineRaw || typeof lineRaw !== "object") {
      return null;
    }
    const line = lineRaw as Record<string, unknown>;
    if (typeof line.orderLineId !== "string" || line.orderLineId.trim().length === 0) {
      return null;
    }
    const issuedQty = parseNonNegativeInt(line.issuedQty);
    if (issuedQty === null) {
      return null;
    }
    return {
      orderLineId: line.orderLineId.trim(),
      issuedQty,
    };
  });

  if (lines.some((line) => line === null)) {
    return null;
  }

  return { lines: lines as IssueOrderInput["lines"] };
}

function isValidCondition(value: unknown): value is CheckinCondition {
  return (
    value === CheckinCondition.OK ||
    value === CheckinCondition.NEEDS_REPAIR ||
    value === CheckinCondition.BROKEN ||
    value === CheckinCondition.MISSING
  );
}

export function parseCheckinInput(body: unknown): CheckinOrderInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return null;
  }

  const lines = payload.lines.map((lineRaw) => {
    if (!lineRaw || typeof lineRaw !== "object") {
      return null;
    }
    const line = lineRaw as Record<string, unknown>;
    if (typeof line.orderLineId !== "string" || line.orderLineId.trim().length === 0) {
      return null;
    }
    const returnedQty = parseNonNegativeInt(line.returnedQty);
    if (returnedQty === null || !isValidCondition(line.condition)) {
      return null;
    }
    return {
      orderLineId: line.orderLineId.trim(),
      returnedQty,
      condition: line.condition,
      comment:
        typeof line.comment === "string" && line.comment.trim().length > 0
          ? line.comment.trim()
          : null,
    };
  });

  if (lines.some((line) => line === null)) {
    return null;
  }

  return { lines: lines as CheckinOrderInput["lines"] };
}

export function toIncidentType(condition: CheckinCondition): IncidentType | null {
  switch (condition) {
    case CheckinCondition.NEEDS_REPAIR:
      return IncidentType.NEEDS_REPAIR;
    case CheckinCondition.BROKEN:
      return IncidentType.BROKEN;
    case CheckinCondition.MISSING:
      return IncidentType.MISSING;
    default:
      return null;
  }
}

export function toAvailabilityStatus(condition: CheckinCondition): AvailabilityStatus | null {
  switch (condition) {
    case CheckinCondition.NEEDS_REPAIR:
      return AvailabilityStatus.NEEDS_REPAIR;
    case CheckinCondition.BROKEN:
      return AvailabilityStatus.BROKEN;
    case CheckinCondition.MISSING:
      return AvailabilityStatus.MISSING;
    default:
      return null;
  }
}

export function resolveLineQty(line: Pick<OrderLine, "issuedQty" | "approvedQty" | "requestedQty">): number {
  return line.issuedQty ?? line.approvedQty ?? line.requestedQty;
}

export function serializeOrder(order: {
  id: string;
  status: OrderStatus;
  startDate: Date;
  endDate: Date;
  pickupTime: string | null;
  notes: string | null;
  discountRate: Prisma.Decimal;
  isEmergency: boolean;
  issuedAt: Date | null;
  returnDeclaredAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  approvedById: string | null;
  issuedById: string | null;
  lines: Array<{
    id: string;
    itemId: string;
    requestedQty: number;
    approvedQty: number | null;
    issuedQty: number | null;
    pricePerDaySnapshot: Prisma.Decimal;
    sourceKitId: string | null;
  }>;
}): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    pickupTime: order.pickupTime,
    notes: order.notes,
    discountRate: Number(order.discountRate),
    isEmergency: order.isEmergency,
    createdById: order.createdById,
    approvedById: order.approvedById,
    issuedById: order.issuedById,
    issuedAt: order.issuedAt?.toISOString() ?? null,
    returnDeclaredAt: order.returnDeclaredAt?.toISOString() ?? null,
    closedAt: order.closedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lines: order.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      requestedQty: line.requestedQty,
      approvedQty: line.approvedQty,
      issuedQty: line.issuedQty,
      sourceKitId: line.sourceKitId,
      pricePerDaySnapshot: Number(line.pricePerDaySnapshot),
    })),
  };
}

export function requiresCheckin(itemType: ItemType): boolean {
  return itemType === ItemType.ASSET || itemType === ItemType.BULK;
}

export function isValidCreateStatus(orderStatus: OrderStatus): boolean {
  return (
    orderStatus === OrderStatus.SUBMITTED ||
    orderStatus === OrderStatus.APPROVED ||
    orderStatus === OrderStatus.ISSUED ||
    orderStatus === OrderStatus.RETURN_DECLARED
  );
}

export function asPrismaDateInput(date: Date): Date {
  return new Date(date.toISOString().slice(0, 10));
}

export type OrderWithLinesAndItems = Order & {
  lines: Array<OrderLine & { item: { id: string; itemType: ItemType; stockTotal: number } }>;
};
