import {
  AvailabilityStatus,
  CheckinCondition,
  IncidentType,
  ItemType,
  OrderSource,
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
  readyByDate?: string;
  customerId?: string;
  customerName?: string;
  /** When set (warehouse creating order for Greenwich), order is created on behalf of this user. */
  greenwichUserId?: string;
  eventName?: string | null;
  orderSource?: OrderSource;
  issueImmediately?: boolean;
  pickupTime?: string | null;
  notes?: string | null;
  isEmergency?: boolean;
  lines: CreateOrderLineInput[];
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
};

export type PatchOrderInput = {
  startDate?: string;
  endDate?: string;
  readyByDate?: string;
  customerId?: string;
  customerName?: string;
  eventName?: string | null;
  pickupTime?: string | null;
  notes?: string | null;
  lines?: CreateOrderLineInput[];
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
};

export type ApproveOrderInput = {
  lines: Array<{
    orderLineId: string;
    approvedQty: number;
    comment?: string | null;
  }>;
  warehouseComment?: string | null;
  deliveryPrice?: number | null;
  mountPrice?: number | null;
  dismountPrice?: number | null;
};

export type IssueOrderInput = {
  lines: Array<{
    orderLineId: string;
    issuedQty: number;
  }>;
};

export type CheckinSegment = {
  condition: CheckinCondition;
  qty: number;
};

export type CheckinOrderInput = {
  lines: Array<{
    orderLineId: string;
    returnedQty: number;
    condition: CheckinCondition;
    comment?: string | null;
    /** When set, sum(segments.qty) must equal issued; returnedQty/condition are ignored for processing. */
    segments?: CheckinSegment[];
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
  const customerId =
    typeof payload.customerId === "string" && payload.customerId.trim().length > 0
      ? payload.customerId.trim()
      : undefined;
  const customerName =
    typeof payload.customerName === "string" && payload.customerName.trim().length > 0
      ? payload.customerName.trim()
      : undefined;
  const greenwichUserId =
    typeof payload.greenwichUserId === "string" && payload.greenwichUserId.trim().length > 0
      ? payload.greenwichUserId.trim()
      : undefined;

  if (
    !startDate ||
    !endDate ||
    !Array.isArray(linesRaw) ||
    linesRaw.length === 0 ||
    (!customerId && !customerName && !greenwichUserId)
  ) {
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

  const deliveryRequested = payload.deliveryRequested === true;
  const mountRequested = payload.mountRequested === true;
  const dismountRequested = payload.dismountRequested === true;

  const readyByDate = parseRequiredDate(payload.readyByDate) ?? startDate;

  return {
    startDate,
    endDate,
    readyByDate,
    customerId,
    customerName,
    greenwichUserId,
    eventName: parseOptionalString(payload.eventName),
    orderSource:
      payload.orderSource === OrderSource.WOWSTORG_EXTERNAL
        ? OrderSource.WOWSTORG_EXTERNAL
        : OrderSource.GREENWICH_INTERNAL,
    issueImmediately: payload.issueImmediately === true,
    pickupTime: parseOptionalString(payload.pickupTime),
    notes: parseOptionalString(payload.notes),
    isEmergency: payload.isEmergency === true,
    lines,
    deliveryRequested,
    deliveryComment: parseOptionalString(payload.deliveryComment),
    mountRequested,
    mountComment: parseOptionalString(payload.mountComment),
    dismountRequested,
    dismountComment: parseOptionalString(payload.dismountComment),
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

  if (payload.readyByDate !== undefined) {
    const readyByDate = parseRequiredDate(payload.readyByDate);
    if (!readyByDate) {
      return null;
    }
    output.readyByDate = readyByDate;
  }

  if (payload.pickupTime !== undefined) {
    output.pickupTime = parseOptionalString(payload.pickupTime);
  }

  if (payload.notes !== undefined) {
    output.notes = parseOptionalString(payload.notes);
  }

  if (payload.customerId !== undefined) {
    if (typeof payload.customerId !== "string" || payload.customerId.trim().length === 0) {
      return null;
    }
    output.customerId = payload.customerId.trim();
  }

  if (payload.customerName !== undefined) {
    if (typeof payload.customerName !== "string" || payload.customerName.trim().length === 0) {
      return null;
    }
    output.customerName = payload.customerName.trim();
  }

  if (payload.eventName !== undefined) {
    output.eventName = parseOptionalString(payload.eventName);
  }

  if (payload.deliveryRequested !== undefined) {
    output.deliveryRequested = payload.deliveryRequested === true;
  }
  if (payload.deliveryComment !== undefined) {
    output.deliveryComment = parseOptionalString(payload.deliveryComment);
  }
  if (payload.mountRequested !== undefined) {
    output.mountRequested = payload.mountRequested === true;
  }
  if (payload.mountComment !== undefined) {
    output.mountComment = parseOptionalString(payload.mountComment);
  }
  if (payload.dismountRequested !== undefined) {
    output.dismountRequested = payload.dismountRequested === true;
  }
  if (payload.dismountComment !== undefined) {
    output.dismountComment = parseOptionalString(payload.dismountComment);
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
      comment:
        typeof line.comment === "string" && line.comment.trim().length > 0
          ? line.comment.trim()
          : null,
    };
  });

  if (lines.some((line) => line === null)) {
    return null;
  }

  function parsePrice(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "number" && !Number.isNaN(value) && value >= 0) return value;
    return null;
  }

  return {
    lines: lines as ApproveOrderInput["lines"],
    warehouseComment:
      typeof payload.warehouseComment === "string" &&
      payload.warehouseComment.trim().length > 0
        ? payload.warehouseComment.trim()
        : null,
    deliveryPrice: parsePrice(payload.deliveryPrice),
    mountPrice: parsePrice(payload.mountPrice),
    dismountPrice: parsePrice(payload.dismountPrice),
  };
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
    const comment =
      typeof line.comment === "string" && line.comment.trim().length > 0
        ? line.comment.trim()
        : null;

    const segmentsRaw = line.segments;
    if (Array.isArray(segmentsRaw) && segmentsRaw.length > 0) {
      const segments: CheckinSegment[] = [];
      for (const s of segmentsRaw) {
        if (!s || typeof s !== "object") return null;
        const seg = s as Record<string, unknown>;
        const qty = parseNonNegativeInt(seg.qty);
        if (qty === null || qty === 0 || !isValidCondition(seg.condition)) return null;
        segments.push({ condition: seg.condition as CheckinCondition, qty });
      }
      const sum = segments.reduce((a, s) => a + s.qty, 0);
      if (sum === 0) return null;
      const returnedQty = segments.find((s) => s.condition === "OK")?.qty ?? 0;
      return {
        orderLineId: line.orderLineId.trim(),
        returnedQty,
        condition: segments[0]!.condition,
        comment,
        segments,
      };
    }

    const returnedQty = parseNonNegativeInt(line.returnedQty);
    if (returnedQty === null || !isValidCondition(line.condition)) {
      return null;
    }
    return {
      orderLineId: line.orderLineId.trim(),
      returnedQty,
      condition: line.condition as CheckinCondition,
      comment,
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
  readyByDate: Date;
  pickupTime: string | null;
  customerId: string | null;
  eventName: string | null;
  orderSource: OrderSource;
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
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
  deliveryPrice?: Prisma.Decimal | null;
  mountPrice?: Prisma.Decimal | null;
  dismountPrice?: Prisma.Decimal | null;
  lines: Array<{
    id: string;
    itemId: string;
    requestedQty: number;
    approvedQty: number | null;
    issuedQty: number | null;
    pricePerDaySnapshot: Prisma.Decimal;
    sourceKitId: string | null;
  }>;
  customer?: {
    name: string;
  } | null;
}): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    readyByDate: order.readyByDate.toISOString().slice(0, 10),
    customerId: order.customerId,
    customerName: order.customer?.name ?? null,
    eventName: order.eventName,
    orderSource: order.orderSource,
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
    deliveryRequested: order.deliveryRequested ?? false,
    deliveryComment: order.deliveryComment ?? null,
    mountRequested: order.mountRequested ?? false,
    mountComment: order.mountComment ?? null,
    dismountRequested: order.dismountRequested ?? false,
    dismountComment: order.dismountComment ?? null,
    deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
    mountPrice: order.mountPrice != null ? Number(order.mountPrice) : null,
    dismountPrice: order.dismountPrice != null ? Number(order.dismountPrice) : null,
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
