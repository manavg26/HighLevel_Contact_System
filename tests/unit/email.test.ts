import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../../src/lib/email.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});
