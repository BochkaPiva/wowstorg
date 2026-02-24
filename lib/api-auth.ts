import { Role, type User } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { getRequestUser, DbUnavailableError } from "@/lib/auth";
import { fail } from "@/lib/http";

const DB_UNAVAILABLE_MSG = "Сервис временно недоступен. Попробуйте через минуту.";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireUser(request: NextRequest): Promise<AuthResult> {
  let user;
  try {
    user = await getRequestUser(request);
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      return { ok: false, response: fail(503, DB_UNAVAILABLE_MSG) };
    }
    throw e;
  }
  if (!user) {
    return { ok: false, response: fail(401, "Unauthorized.") };
  }

  return { ok: true, user };
}

export function isWarehouseSide(role: Role): boolean {
  return role === Role.WAREHOUSE || role === Role.ADMIN;
}

export function isGreenwich(role: Role): boolean {
  return role === Role.GREENWICH;
}

export async function requireWarehouseUser(
  request: NextRequest,
): Promise<AuthResult> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth;
  }

  if (!isWarehouseSide(auth.user.role)) {
    return { ok: false, response: fail(403, "Forbidden.") };
  }

  return auth;
}
