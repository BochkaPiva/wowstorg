import { AvailabilityStatus } from "@prisma/client";

/**
 * Статус позиции по «ведрам»: если есть хотя бы 1 доступная шт (не в ремонте/сломано/утеряно),
 * позиция считается доступной (ACTIVE). Проблемный статус только когда доступно 0 шт.
 */
export function resolveAvailabilityStatusFromBuckets(input: {
  currentStatus: AvailabilityStatus;
  stockTotal: number;
  stockInRepair: number;
  stockBroken: number;
  stockMissing: number;
}): AvailabilityStatus {
  if (input.currentStatus === AvailabilityStatus.RETIRED) {
    return AvailabilityStatus.RETIRED;
  }
  const available =
    input.stockTotal -
    input.stockInRepair -
    input.stockBroken -
    input.stockMissing;
  if (available > 0) {
    return AvailabilityStatus.ACTIVE;
  }
  if (input.stockMissing > 0) return AvailabilityStatus.MISSING;
  if (input.stockBroken > 0) return AvailabilityStatus.BROKEN;
  if (input.stockInRepair > 0) return AvailabilityStatus.NEEDS_REPAIR;
  return AvailabilityStatus.ACTIVE;
}
