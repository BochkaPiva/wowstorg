import { IncidentType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function parseDate(input: string | null): Date | null {
  if (!input) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const startDateRaw = request.nextUrl.searchParams.get("startDate");
  const endDateRaw = request.nextUrl.searchParams.get("endDate");
  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);

  if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
    return fail(400, "Invalid date format. Use YYYY-MM-DD.");
  }

  const incidents = await prisma.incident.findMany({
    where: {
      createdAt: {
        gte: startDate ?? undefined,
        lte: endDate
          ? new Date(new Date(endDate).setUTCHours(23, 59, 59, 999))
          : undefined,
      },
    },
    select: {
      type: true,
    },
  });

  const summary: Record<IncidentType, number> = {
    NEEDS_REPAIR: 0,
    BROKEN: 0,
    MISSING: 0,
  };

  for (const incident of incidents) {
    summary[incident.type] += 1;
  }

  return NextResponse.json({
    total: incidents.length,
    summary,
  });
}
