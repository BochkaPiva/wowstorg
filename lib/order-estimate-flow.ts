/**
 * Снимки и сравнение для флоу «смета → подтверждение гринвича → согласование склада».
 * Без потери данных: снимки только для сравнения, текущие данные заявки не перезатираются.
 */

export type OrderEstimateSnapshotLine = {
  orderLineId: string;
  itemId: string;
  sourceKitId: string | null;
  itemName: string;
  approvedQty: number;
};

export type OrderEstimateSnapshot = {
  lines: OrderEstimateSnapshotLine[];
  deliveryPrice: number | null;
  mountPrice: number | null;
  dismountPrice: number | null;
};

type OrderWithLines = {
  lines: Array<{
    id: string;
    itemId: string;
    approvedQty: number | null;
    requestedQty?: number;
    sourceKitId?: string | null;
    item?: { name: string };
  }>;
  deliveryPrice: unknown;
  mountPrice: unknown;
  dismountPrice: unknown;
};

/** При опции useRequestedWhenApprovedNull для строк с approvedQty === null берётся requestedQty (для снимка «подтверждено» гринвичем). */
export function buildOrderSnapshot(
  order: OrderWithLines,
  options?: { useRequestedWhenApprovedNull?: boolean },
): OrderEstimateSnapshot {
  const useRequested = options?.useRequestedWhenApprovedNull === true;
  const lines = order.lines.map((line) => {
    const qty =
      useRequested && line.approvedQty == null
        ? (line.requestedQty ?? 0)
        : (line.approvedQty ?? 0);
    return {
      orderLineId: line.id,
      itemId: line.itemId,
      sourceKitId: line.sourceKitId ?? null,
      itemName: (line.item as { name: string } | undefined)?.name ?? "",
      approvedQty: qty,
    };
  });
  return {
    lines,
    deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
    mountPrice: order.mountPrice != null ? Number(order.mountPrice) : null,
    dismountPrice: order.dismountPrice != null ? Number(order.dismountPrice) : null,
  };
}

function lineKey(itemId: string, sourceKitId: string | null): string {
  return `${itemId}::${sourceKitId ?? "-"}`;
}

/** Сравнение по составу (itemId + sourceKitId) и количеству, т.к. при редактировании гринвичем line id меняются. */
export function orderStateEqualsSnapshot(
  order: OrderWithLines,
  snapshot: OrderEstimateSnapshot | null,
): boolean {
  if (!snapshot) return false;

  const orderByKey = new Map<string, number>();
  for (const line of order.lines) {
    const key = lineKey(line.itemId, line.sourceKitId ?? null);
    const qty = line.approvedQty ?? line.requestedQty ?? 0;
    orderByKey.set(key, (orderByKey.get(key) ?? 0) + qty);
  }
  const snapByKey = new Map<string, number>();
  for (const line of snapshot.lines) {
    const key = lineKey(line.itemId, line.sourceKitId ?? null);
    snapByKey.set(key, (snapByKey.get(key) ?? 0) + line.approvedQty);
  }

  if (orderByKey.size !== snapByKey.size) return false;
  for (const [key, qty] of orderByKey) {
    if (snapByKey.get(key) !== qty) return false;
  }

  const dp = order.deliveryPrice != null ? Number(order.deliveryPrice) : null;
  const mp = order.mountPrice != null ? Number(order.mountPrice) : null;
  const dmp = order.dismountPrice != null ? Number(order.dismountPrice) : null;
  if (dp !== snapshot.deliveryPrice || mp !== snapshot.mountPrice || dmp !== snapshot.dismountPrice) {
    return false;
  }
  return true;
}

export type EstimateConfirmDiff = {
  added: Array<{ itemName: string; approvedQty: number }>;
  removed: Array<{ itemName: string; approvedQty: number }>;
  changed: Array<{ itemName: string; was: number; became: number }>;
  deliveryPriceChanged: boolean;
  mountPriceChanged: boolean;
  dismountPriceChanged: boolean;
};

export function buildEstimateConfirmDiff(
  estimateSnapshot: OrderEstimateSnapshot | null,
  confirmedSnapshot: OrderEstimateSnapshot,
): EstimateConfirmDiff {
  const result: EstimateConfirmDiff = {
    added: [],
    removed: [],
    changed: [],
    deliveryPriceChanged: false,
    mountPriceChanged: false,
    dismountPriceChanged: false,
  };

  if (!estimateSnapshot) {
    result.added = confirmedSnapshot.lines.map((l) => ({ itemName: l.itemName, approvedQty: l.approvedQty }));
    result.deliveryPriceChanged = confirmedSnapshot.deliveryPrice != null;
    result.mountPriceChanged = confirmedSnapshot.mountPrice != null;
    result.dismountPriceChanged = confirmedSnapshot.dismountPrice != null;
    return result;
  }

  const estByKey = new Map(
    estimateSnapshot.lines.map((l) => [lineKey(l.itemId, l.sourceKitId ?? null), l]),
  );
  const confByKey = new Map(
    confirmedSnapshot.lines.map((l) => [lineKey(l.itemId, l.sourceKitId ?? null), l]),
  );

  for (const [key, conf] of confByKey) {
    const est = estByKey.get(key);
    if (!est) {
      result.added.push({ itemName: conf.itemName, approvedQty: conf.approvedQty });
    } else if (est.approvedQty !== conf.approvedQty) {
      result.changed.push({ itemName: conf.itemName, was: est.approvedQty, became: conf.approvedQty });
    }
  }
  for (const [key, est] of estByKey) {
    if (!confByKey.has(key)) {
      result.removed.push({ itemName: est.itemName, approvedQty: est.approvedQty });
    }
  }

  result.deliveryPriceChanged = estimateSnapshot.deliveryPrice !== confirmedSnapshot.deliveryPrice;
  result.mountPriceChanged = estimateSnapshot.mountPrice !== confirmedSnapshot.mountPrice;
  result.dismountPriceChanged = estimateSnapshot.dismountPrice !== confirmedSnapshot.dismountPrice;

  return result;
}

/** Человекочитаемый текст изменений для уведомления складу (с разбивкой по строкам). */
export function formatEstimateConfirmDiffForWarehouse(diff: EstimateConfirmDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) {
    const added = diff.added
      .filter((a) => a.approvedQty > 0)
      .map((a) => `${a.itemName} × ${a.approvedQty}`);
    if (added.length > 0) {
      parts.push("Добавлено:\n  • " + added.join("\n  • "));
    }
  }
  if (diff.removed.length > 0) {
    parts.push(
      "Удалено:\n  • " +
        diff.removed.map((r) => `${r.itemName} × ${r.approvedQty}`).join("\n  • "),
    );
  }
  if (diff.changed.length > 0) {
    parts.push(
      "Изменено кол-во:\n  • " +
        diff.changed.map((c) => `${c.itemName}: ${c.was} → ${c.became}`).join("\n  • "),
    );
  }
  if (diff.deliveryPriceChanged || diff.mountPriceChanged || diff.dismountPriceChanged) {
    const svc: string[] = [];
    if (diff.deliveryPriceChanged) svc.push("доставка");
    if (diff.mountPriceChanged) svc.push("монтаж");
    if (diff.dismountPriceChanged) svc.push("демонтаж");
    parts.push(`Доп. услуги: изменены цены (${svc.join(", ")})`);
  }
  return parts.length > 0 ? parts.join("\n\n") : "Без изменений";
}
