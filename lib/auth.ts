import type { Role, User } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function getRequestUser(request: NextRequest): Promise<User | null> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    return null;
  }

  if (user.telegramId.toString() !== session.telegramId) {
    return null;
  }

  return user;
}

export function hasRole(user: User, roles: Role[]): boolean {
  return roles.includes(user.role);
}
