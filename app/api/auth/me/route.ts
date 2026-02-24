import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  let user;
  try {
    user = await getRequestUser(request);
  } catch (e) {
    console.error("[auth/me] DB error:", e);
    return fail(503, "Сервис временно недоступен. Попробуйте через минуту.");
  }
  if (!user) {
    const response = fail(401, "Unauthorized.");
    return clearSessionCookie(response);
  }

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      role: user.role,
    },
  });
}
