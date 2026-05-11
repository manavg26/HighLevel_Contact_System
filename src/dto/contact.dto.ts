import { z } from "zod";

export const contactWriteSchema = z
  .object({
    name: z.string().min(1).max(512),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(3).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.email && !val.phoneNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either email or phoneNumber is required.",
        path: ["email"],
      });
    }
  });

export type ContactWriteDto = z.infer<typeof contactWriteSchema>;

export const contactResponseSchema = z.object({
  contactId: z.string().uuid(),
  tenantId: z.string().min(1),
  name: z.string(),
  email: z.string().email().nullable(),
  phoneNumber: z.string().nullable(),
  outcome: z.enum(["created", "updated", "deduplicated", "replay"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ContactResponseDto = z.infer<typeof contactResponseSchema>;
