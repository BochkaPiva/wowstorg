import { NextResponse } from "next/server";

type JsonObject = Record<string, unknown>;

export function ok(data: JsonObject, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function fail(
  status: number,
  message: string,
  details?: JsonObject,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        ...(details ?? {}),
      },
    },
    { status },
  );
}
