/**
 * Снимки и сравнение для флоу «смета → подтверждение гринвича → согласование склада».
 * Без потери данных: снимки только для сравнения, текущие данные заявки не перезатираются.
 */

export type OrderEstimateSnapshotLine = {
  orderLineId: string;
  itemId: string;
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
    item?: { name: string };
  }>;
  deliveryPrice: unknown;
  mountPrice: unknown;
  dismountPrice: unknown;
};

export function buildOrderSnapshot(order: OrderWithLines): OrderEstimateSnapshot {
  const lines = order.lines.map((line) => ({
    orderLineId: line.id,
    itemId: line.itemId,
    itemName: (line.item as { name: string } | undefined)?.name ?? "",
    approvedQty: line.approvedQty ?? 0,
  }));
  return {
    lines,
    deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
    mountPrice: order.mountPrice != null ? Number(order.mountPrice) : null,
    dismountPrice: order.dismountPrice != null ? Number(order.dismountPrice) : null,
  };
}

export function orderStateEqualsSnapshot(
  order: OrderWithLines,
  snapshot: OrderEstimateSnapshot | null,
): boolean {
  if (!snapshot) return false;

  const byId = new Map(order.lines.map((l) => [l.id, l]));
  const snapById = new Map(snapshot.lines.map((l) => [l.orderLineId, l]));

  if (byId.size !== snapById.size) return false;
  for (const [id, line] of byId) {
    const snap = snapById.get(id);
    if (!snap || (line.approvedQty ?? 0) !== snap.approvedQty) return false;
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

  const estById = new Map(estimateSnapshot.lines.map((l) => [l.orderLineId, l]));
  const confById = new Map(confirmedSnapshot.lines.map((l) => [l.orderLineId, l]));

  for (const [id, conf] of confById) {
    const est = estById.get(id);
    if (!est) {
      result.added.push({ itemName: conf.itemName, approvedQty: conf.approvedQty });
    } else if (est.approvedQty !== conf.approvedQty) {
      result.changed.push({ itemName: conf.itemName, was: est.approvedQty, became: conf.approvedQty });
    }
  }
  for (const [id, est] of estById) {
    if (!confById.has(id)) {
      result.removed.push({ itemName: est.itemName, approvedQty: est.approvedQty });
    }
  }

  result.deliveryPriceChanged = estimateSnapshot.deliveryPrice !== confirmedSnapshot.deliveryPrice;
  result.mountPriceChanged = estimateSnapshot.mountPrice !== confirmedSnapshot.mountPrice;
  result.dismountPriceChanged = estimateSnapshot.dismountPrice !== confirmedSnapshot.dismountPrice;

  return result;
}

/** Человекочитаемый текст изменений для уведомления складу. */
export function formatEstimateConfirmDiffForWarehouse(diff: EstimateConfirmDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) {
    parts.push(`Добавлено: ${diff.added.map((a) => `${a.itemName} × ${a.approvedQty}`).join("; ")}`);
  }
  if (diff.removed.length > 0) {
    parts.push(`Удалено: ${diff.removed.map((r) => `${r.itemName} × ${r.approvedQty}`).join("; ")}`);
  }
  if (diff.changed.length > 0) {
    parts.push(
      `Изменено: ${diff.changed.map((c) => `${c.itemName} ${c.was} → ${c.became}`).join("; ")}`,
    );
  }
  if (diff.deliveryPriceChanged || diff.mountPriceChanged || diff.dismountPriceChanged) {
    const svc: string[] = [];
    if (diff.deliveryPriceChanged) svc.push("доставка");
    if (diff.mountPriceChanged) svc.push("монтаж");
    if (diff.dismountPriceChanged) svc.push("демонтаж");
    parts.push(`Доп. услуги: изменены цены (${svc.join(", ")})`);
  }
  return parts.length > 0 ? parts.join(". ") : "Без изменений";
}
