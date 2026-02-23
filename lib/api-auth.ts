import { Role, type User } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { fail } from "@/lib/http";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireUser(request: NextRequest): Promise<AuthResult> {
  const user = await getRequestUser(request);
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
