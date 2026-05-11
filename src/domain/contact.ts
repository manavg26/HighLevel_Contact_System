export type ContactUpsertOutcome = "created" | "updated" | "deduplicated";

export type ContactRow = {
  contactId: string;
  tenantId: string;
  name: string;
  emailNormalized: string | null;
  phoneE164: string | null;
  createdAt: Date;
  updatedAt: Date;
};
