import { describe, expect, it } from "vitest";
import { normalizePhone } from "../../src/lib/phone.js";

describe("normalizePhone", () => {
  it("normalizes US numbers to E.164", () => {
    const r = normalizePhone("(415) 555-2671", "US");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe("+14155552671");
  });

  it("rejects invalid input", () => {
    const r = normalizePhone("not-a-phone", "US");
    expect(r.ok).toBe(false);
  });
});
