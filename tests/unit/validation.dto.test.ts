import { describe, expect, it } from "vitest";
import { contactWriteSchema } from "../../src/dto/contact.dto.js";

describe("contactWriteSchema", () => {
  it("accepts email-only", () => {
    const r = contactWriteSchema.parse({
      name: "Ada",
      email: "Ada@Example.com",
    });
    expect(r.email).toBe("Ada@Example.com");
  });

  it("rejects when both identifiers missing", () => {
    expect(() =>
      contactWriteSchema.parse({
        name: "Ada",
      }),
    ).toThrow();
  });
});
