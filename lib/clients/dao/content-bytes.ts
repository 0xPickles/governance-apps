import { sha256, type Hex } from "viem";
import { z } from "@/lib/schemas/zod";
import { DAO_CONTENT_MAX_BYTES, DaoHashSchema } from "@/lib/schemas/dao-feed";
import { canonicalizeDaoProposalContent, createDaoRawSha256Cid, parseDaoProposalContent } from "./content";
import type { DaoProposal, DaoProposalContent } from "./types";

const contentSchema = z.strictObject({
  schema: z.literal("yearn.dao.proposal.v1"),
  markdown: z.string(),
  discussionUrl: z.string().max(2048),
  proposalType: z.enum(["signal", "executable"]),
  createdBy: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  createdAt: z.iso.datetime({ offset: true }),
  assets: z.array(z.strictObject({
    path: z.string(), mediaType: z.string(), byteLength: z.number().int().nonnegative(),
    digest: DaoHashSchema, width: z.number().int().nullable(), height: z.number().int().nullable(),
  })).max(16),
});

export function decodeDaoContentBytes(encoded: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("Content encoding is not canonical base64.");
  const binary = atob(encoded);
  if (btoa(binary) !== encoded || binary.length > DAO_CONTENT_MAX_BYTES) throw new Error("Content bytes exceed the limit or use noncanonical base64.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Enrichment failures are local to this proposal. Expected digest never changes. */
export function readDaoContentBytes(encoded: string | null, digest: Hex): DaoProposal["content"] {
  const base = { cid: createDaoRawSha256Cid(digest), digest, value: null };
  if (encoded === null) return { ...base, state: "unavailable", error: "Proposal content is unavailable." };
  let computedDigest: Hex | null = null;
  try {
    const bytes = decodeDaoContentBytes(encoded);
    computedDigest = sha256(bytes);
    if (computedDigest !== digest) throw new Error("Content digest does not match the onchain commitment.");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = contentSchema.parse(JSON.parse(source)) as DaoProposalContent;
    const parsed = parseDaoProposalContent(value);
    if (parsed.errors.length) throw new Error(parsed.errors[0].message);
    const canonical = canonicalizeDaoProposalContent(value);
    if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index])) throw new Error("Proposal content is not canonical JSON with one final LF.");
    return { ...base, state: "available", value, error: null, computedDigest };
  } catch (error) {
    return { ...base, state: "invalid", error: error instanceof Error ? error.message : "Invalid proposal content.", computedDigest };
  }
}
