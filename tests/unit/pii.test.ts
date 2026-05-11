import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone } from "../../src/lib/pii.js";

describe("pii masking", () => {
  it("masks email", () => {
    expect(maskEmail("jane.doe@example.com")).toMatch(/j\*\*\*e@/);
  });

  it("masks phone", () => {
    expect(maskPhone("+14155552671")).toContain("71");
  });
});
