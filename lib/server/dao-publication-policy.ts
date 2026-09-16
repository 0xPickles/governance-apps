import { z } from "@/lib/schemas/zod";

export const DAO_PUBLICATION_DEFAULT_LIMITS = {
  hourlyDocuments: 2, dailyDocuments: 10, monthlyDocuments: 40,
  documents: 300, bytes: 39_321_600, concurrent: 2,
  uploadAttempts: 500, documentUploadAttempts: 3,
  retrievalAttempts: 1800, documentRetrievalAttempts: 6, documentReservations: 6,
};
export type DaoPublicationLimits = typeof DAO_PUBLICATION_DEFAULT_LIMITS;
const positive = z.number().int().positive().max(1_000_000);
const limitsSchema = z.object({
  hourlyDocuments: positive, dailyDocuments: positive, monthlyDocuments: positive,
  documents: positive.max(10_000), bytes: z.number().int().positive().max(1_310_720_000),
  concurrent: positive.max(2), uploadAttempts: positive, documentUploadAttempts: positive.max(10),
  retrievalAttempts: positive, documentRetrievalAttempts: positive.max(20), documentReservations: positive.max(20),
}).strict().partial();

export type DaoPublicationErrorCode = "disabled" | "unavailable" | "budget_reached" | "busy" | "verification_pending" | "invalid_content" | "invalid_forum";
const messages: Record<DaoPublicationErrorCode, string> = {
  disabled: "Publication is disabled. Keep your draft and try again later.",
  unavailable: "Publication is temporarily unavailable. Keep your reviewed content and try again later.",
  budget_reached: "The publication budget is reached. Keep your reviewed content and try again later.",
  busy: "Publication is already in progress. Wait before retrying the same content.",
  verification_pending: "Publication could not yet be verified. Wait before retrying the same content.",
  invalid_content: "The content does not match its canonical bytes and identity. Review the proposal again.",
  invalid_forum: "The discussion no longer passes forum validation. Validate the topic again.",
};
export class DaoPublicationPolicyError extends Error {
  constructor(readonly code: DaoPublicationErrorCode, readonly status: number) { super(messages[code]); }
}
export function requireDaoPublicationEnabled() {
  if (process.env.DAO_PUBLICATION_ENABLED !== "true") throw new DaoPublicationPolicyError("disabled", 404);
}
export function daoPublicationLimits(): DaoPublicationLimits {
  try {
    const raw = process.env.DAO_PUBLICATION_LIMITS;
    if (raw && raw.length > 4096) throw new Error("Invalid limits");
    return { ...DAO_PUBLICATION_DEFAULT_LIMITS, ...limitsSchema.parse(raw ? JSON.parse(raw) : {}) };
  } catch { throw new DaoPublicationPolicyError("unavailable", 503); }
}
