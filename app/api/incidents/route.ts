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

  const params = request.nextUrl.searchParams;
  const startDateRaw = params.get("startDate");
  const endDateRaw = params.get("endDate");
  const typeRaw = params.get("type");

  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);

  if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
    return fail(400, "Invalid date format. Use YYYY-MM-DD.");
  }
  if (startDate && endDate && startDate > endDate) {
    return fail(400, "startDate must be less or equal to endDate.");
  }

  if (typeRaw && !Object.values(IncidentType).includes(typeRaw as IncidentType)) {
    return fail(400, "Invalid incident type.");
  }

  const incidents = await prisma.incident.findMany({
    where: {
      type: typeRaw ? (typeRaw as IncidentType) : undefined,
      createdAt: {
        gte: startDate ?? undefined,
        lte: endDate
          ? new Date(new Date(endDate).setUTCHours(23, 59, 59, 999))
          : undefined,
      },
    },
    include: {
      item: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, username: true, role: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({
    incidents: incidents.map((incident) => ({
      id: incident.id,
      type: incident.type,
      description: incident.description,
      createdAt: incident.createdAt.toISOString(),
      orderId: incident.orderId,
      orderLineId: incident.orderLineId,
      item: incident.item,
      createdBy: {
        id: incident.createdBy.id,
        username: incident.createdBy.username,
        role: incident.createdBy.role,
      },
    })),
  });
}
