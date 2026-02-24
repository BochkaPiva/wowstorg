export type CheckinCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";

export function checkinConditionLabel(condition: CheckinCondition): string {
  switch (condition) {
    case "OK":
      return "норма";
    case "NEEDS_REPAIR":
      return "требует ремонта";
    case "BROKEN":
      return "сломано";
    case "MISSING":
      return "не возвращено (утеряно)";
    default:
      return condition;
  }
}
