import { describe, expect, it } from "vitest";
import { stableFingerprint } from "../../src/lib/fingerprint.js";

describe("stableFingerprint", () => {
  it("is stable across key order", () => {
    const a = stableFingerprint({ b: 2, a: 1 });
    const b = stableFingerprint({ a: 1, b: 2 });
    expect(a).toBe(b);
  });
});
