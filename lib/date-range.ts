export type DateRange = {
  startDate: Date;
  endDate: Date;
};

function parseDateOnly(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function parseDateRange(
  startRaw: string | null,
  endRaw: string | null,
): { ok: true; value: DateRange | null } | { ok: false; message: string } {
  if (!startRaw && !endRaw) {
    return { ok: true, value: null };
  }

  if (!startRaw || !endRaw) {
    return { ok: false, message: "Both startDate and endDate are required." };
  }

  const startDate = parseDateOnly(startRaw);
  const endDate = parseDateOnly(endRaw);

  if (!startDate || !endDate) {
    return {
      ok: false,
      message: "startDate and endDate must be YYYY-MM-DD.",
    };
  }

  if (startDate >= endDate) {
    return { ok: false, message: "endDate must be greater than startDate." };
  }

  return {
    ok: true,
    value: {
      startDate,
      endDate,
    },
  };
}
