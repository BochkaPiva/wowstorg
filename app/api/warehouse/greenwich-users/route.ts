import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.WAREHOUSE && auth.user.role !== Role.ADMIN) {
    return fail(403, "Only warehouse/admin can list Greenwich users.");
  }

  const users = await prisma.user.findMany({
    where: { role: Role.GREENWICH },
    select: { id: true, username: true, telegramId: true },
    orderBy: [{ username: "asc" }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username ?? `ID ${u.telegramId}`,
    })),
  });
}
