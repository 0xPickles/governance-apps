import { readFileSync } from "node:fs";
import { restoreDaoAuthoringReview } from "@/lib/clients/dao/authoring-recovery";
import { validateDaoPublicationBytes } from "@/lib/clients/dao/publication";
import type { Address } from "viem";

// Exact recovered documents; forum metadata and all database state in tests are synthetic.
export const recoveredBytes = (name: "A" | "B" | "C") => new Uint8Array(readFileSync(`tests/fixtures/dao-pinata-recovery/${name}.json`));
export const recoveredTopic = {
  topicId: 1234, normalizedUrl: "https://gov.yearn.fi/t/local-fork-uat/1234",
  title: "Local fork UAT", categoryId: 5, category: "Proposals", author: "local-uat", createdAt: 1,
};
export function recoveredReview(name: "A" | "B" | "C" = "B") {
  const bytes = recoveredBytes(name), identity = validateDaoPublicationBytes(bytes);
  const address = identity.content.createdBy as Address;
  return { bytes, identity, address, review: restoreDaoAuthoringReview(bytes, address, recoveredTopic, "0x") };
}
