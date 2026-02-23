import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramInitUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type VerifiedInitData = {
  user: TelegramInitUser;
  authDate: number;
};

type VerifyOk = {
  ok: true;
  value: VerifiedInitData;
};

type VerifyFail = {
  ok: false;
  reason: string;
};

export type VerifyInitDataResult = VerifyOk | VerifyFail;

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): VerifyInitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { ok: false, reason: "Missing hash in initData." };
  }

  const checkParts: string[] = [];

  for (const [key, value] of params.entries()) {
    if (key === "hash") {
      continue;
    }
    checkParts.push(`${key}=${value}`);
  }

  checkParts.sort((a, b) => a.localeCompare(b));
  const dataCheckString = checkParts.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const givenHashBuffer = Buffer.from(hash, "hex");
  const calculatedHashBuffer = Buffer.from(calculatedHash, "hex");

  if (
    givenHashBuffer.length !== calculatedHashBuffer.length ||
    !timingSafeEqual(givenHashBuffer, calculatedHashBuffer)
  ) {
    return { ok: false, reason: "Invalid initData signature." };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;

  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: "Invalid auth_date in initData." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) {
    return { ok: false, reason: "initData is expired." };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, reason: "Missing user payload in initData." };
  }

  let user: TelegramInitUser;
  try {
    user = JSON.parse(userRaw) as TelegramInitUser;
  } catch {
    return { ok: false, reason: "Invalid user payload JSON." };
  }

  if (!user.id || !Number.isFinite(user.id)) {
    return { ok: false, reason: "Invalid Telegram user id." };
  }

  return {
    ok: true,
    value: {
      user,
      authDate,
    },
  };
}
