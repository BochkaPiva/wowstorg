import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "ws_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  userId: string;
  telegramId: string;
  role: Role;
};

function sign(value: string): string {
  const secret = getRequiredEnv("SESSION_SECRET");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      userId?: unknown;
      telegramId?: unknown;
      role?: unknown;
    };

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.telegramId !== "string" ||
      typeof parsed.role !== "string"
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      telegramId: parsed.telegramId,
      role: parsed.role as Role,
    };
  } catch {
    return null;
  }
}

export function createSessionToken(payload: SessionPayload): string {
  const encoded = encodePayload(payload);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function parseSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  return decodePayload(encoded);
}

export function setSessionCookie(
  response: NextResponse,
  payload: SessionPayload,
): NextResponse {
  const token = createSessionToken(payload);

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });

  return response;
}

export function getSessionFromRequest(request: NextRequest): SessionPayload | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return parseSessionToken(token);
}
