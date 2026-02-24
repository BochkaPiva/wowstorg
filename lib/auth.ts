import type { Role, User } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

/** Thrown when DB is unavailable (e.g. connection closed). Handle with 503. */
export class DbUnavailableError extends Error {
  constructor(cause: unknown) {
    super("DB unavailable");
    this.name = "DbUnavailableError";
    this.cause = cause;
  }
}

export async function getRequestUser(request: NextRequest): Promise<User | null> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return null;
  }

  let user: User | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
  } catch (e) {
    console.error("[getRequestUser] DB error:", e);
    throw new DbUnavailableError(e);
  }

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
