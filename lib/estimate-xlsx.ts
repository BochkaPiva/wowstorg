import * as XLSX from "xlsx";

type OrderLineForEstimate = {
  itemName: string;
  requestedQty: number;
  pricePerDay: number;
};

export function buildEstimateXlsx(params: {
  orderId: string;
  startDate: string;
  endDate: string;
  customerName: string | null;
  eventName: string | null;
  lines: OrderLineForEstimate[];
  deliveryPrice: number | null;
  mountPrice: number | null;
  dismountPrice: number | null;
}): Buffer {
  const rows: (string | number)[][] = [
    ["Смета заявки", params.orderId],
    ["Период", `${params.startDate} — ${params.endDate}`],
    ["Заказчик", params.customerName ?? "—"],
    ...(params.eventName ? [["Мероприятие", params.eventName]] : []),
    [],
    ["Позиция", "Кол-во", "Цена за сутки, ₽", "Сумма, ₽"],
  ];

  let total = 0;
  const diffMs =
    new Date(`${params.endDate}T00:00:00`).getTime() -
    new Date(`${params.startDate}T00:00:00`).getTime();
  const rentalDays = Math.max(1, Math.round(diffMs / 86400000) || 1);

  for (const line of params.lines) {
    const lineTotal = line.pricePerDay * line.requestedQty * rentalDays;
    total += lineTotal;
    rows.push([line.itemName, line.requestedQty, line.pricePerDay, lineTotal]);
  }

  if (params.deliveryPrice != null) {
    rows.push(["Доставка", 1, params.deliveryPrice, params.deliveryPrice]);
    total += params.deliveryPrice;
  }
  if (params.mountPrice != null) {
    rows.push(["Монтаж", 1, params.mountPrice, params.mountPrice]);
    total += params.mountPrice;
  }
  if (params.dismountPrice != null) {
    rows.push(["Демонтаж", 1, params.dismountPrice, params.dismountPrice]);
    total += params.dismountPrice;
  }

  rows.push([], ["Итого", "", "", total]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Смета");
  return Buffer.from(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx", bookSST: false }),
  );
}
