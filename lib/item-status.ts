import { AvailabilityStatus } from "@prisma/client";

export function resolveAvailabilityStatusFromBuckets(input: {
  currentStatus: AvailabilityStatus;
  stockInRepair: number;
  stockBroken: number;
  stockMissing: number;
}): AvailabilityStatus {
  if (input.currentStatus === AvailabilityStatus.RETIRED) {
    return AvailabilityStatus.RETIRED;
  }
  if (input.stockMissing > 0) {
    return AvailabilityStatus.MISSING;
  }
  if (input.stockBroken > 0) {
    return AvailabilityStatus.BROKEN;
  }
  if (input.stockInRepair > 0) {
    return AvailabilityStatus.NEEDS_REPAIR;
  }
  return AvailabilityStatus.ACTIVE;
}
