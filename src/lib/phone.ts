import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

export function normalizePhone(
  raw: string,
  defaultRegion: string,
): PhoneNormalizeResult {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultRegion as never);
  if (!parsed?.isValid()) {
    return { ok: false, reason: "INVALID_PHONE" };
  }
  return { ok: true, e164: parsed.format("E.164") };
}
