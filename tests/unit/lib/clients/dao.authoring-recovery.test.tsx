import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { daoAuthoringStorageKey, readDaoAuthoringRecovery, restoreDaoAuthoringReview, saveDaoAuthoringRecovery } from "@/lib/clients/dao/authoring-recovery";
import { recoveredReview, recoveredTopic } from "@/tests/fixtures/dao-pinata-recovery";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { DAO_EXECUTOR_VALID_SCRIPT_VECTORS } from "@/lib/clients/dao";

const { bytes, identity, address, review } = recoveredReview();
const key = daoAuthoringStorageKey("deployment-1", address);
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("retains original B and its topic/script/identity before any publication", () => {
  expect(bytes.length).toBe(567);
  expect(identity.digest).toBe("0xeddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e");
  expect(identity.cid).toBe("bafkreihn345ra6dn6newwpjwulghz7an6vnpez3ojzd5rbpkgbs3uqeqhy");
  expect(saveDaoAuthoringRecovery(key, review)).toBe(true);
  const restored = readDaoAuthoringRecovery(key, address)!;
  expect(restored).toMatchObject({ state: "unpublished", publication: null, transactionHash: null, expectedEpoch: null });
  expect(restored.review.content.createdAt).toBe("2026-09-18T16:53:51.000Z");
  expect(restored.review.topic).toEqual(review.topic);
  expect(restored.review.scriptCheck).toEqual(review.scriptCheck);
  expect(Array.from(deriveDaoProposalContentIdentity(restored.review.content).bytes)).toEqual(Array.from(bytes));
  expect(readDaoAuthoringRecovery(daoAuthoringStorageKey("deployment-2", address), address)).toBeNull();
  expect(readDaoAuthoringRecovery(key, "0x1111111111111111111111111111111111111111")).toBeNull();
});

it("retains executable scripts without deriving them from document bytes", () => {
  const content = { ...review.content, proposalType: "executable" as const };
  const executable = restoreDaoAuthoringReview(deriveDaoProposalContentIdentity(content).bytes, address, recoveredTopic, DAO_EXECUTOR_VALID_SCRIPT_VECTORS.oneCall.script);
  saveDaoAuthoringRecovery(key, executable);
  expect(readDaoAuthoringRecovery(key, address)?.review.scriptCheck.script).toBe(executable.scriptCheck.script);
});

it("reads legacy published A without requiring a new publication or losing its transaction", () => {
  const a = recoveredReview("A"), hash = "0x" + "ab".repeat(32);
  sessionStorage.setItem(key, JSON.stringify({ content: a.review.content, topic: a.review.topic, script: "0x", digest: a.identity.digest,
    publishedAt: 1789747079, transactionHash: hash, expectedEpoch: "17" }));
  const restored = readDaoAuthoringRecovery(key, address);
  expect(restored).toMatchObject({ state: "published", publication: { fingerprint: a.identity.digest }, transactionHash: hash, expectedEpoch: 17n });
  expect(Array.from(restored!.publication!.canonicalBytes)).toEqual(Array.from(a.bytes));
});

it.each([
  { digest: "0x00" }, { cid: "wrong" }, { state: "acknowledged" },
  { publishedAt: 1 }, { transactionHash: "0x" + "ab".repeat(32) },
  { topic: { ...recoveredTopic, categoryId: 99 } }, { topic: { ...recoveredTopic, topicId: 99 } },
  { script: "0xbad" }, { content: { ...review.content, createdAt: "2026-09-18T16:56:15.000Z" } },
])("rejects corrupt or inconsistent stored review %j", patch => {
  saveDaoAuthoringRecovery(key, review);
  sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(key)!), ...patch }));
  expect(readDaoAuthoringRecovery(key, address)).toBeNull();
});

it("handles unavailable, malformed and oversized storage without changing the in-memory review", () => {
  for (const value of ["{", "x".repeat(262145)]) {
    sessionStorage.setItem(key, value);
    expect(readDaoAuthoringRecovery(key, address)).toBeNull();
  }
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  expect(saveDaoAuthoringRecovery(key, review)).toBe(false);
  expect(Array.from(deriveDaoProposalContentIdentity(review.content).bytes)).toEqual(Array.from(bytes));
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  expect(readDaoAuthoringRecovery(key, address)).toBeNull();
});

it("rejects changed/noncanonical exports and foreign wallets during import", () => {
  expect(() => restoreDaoAuthoringReview(bytes.slice(0, -1), address, recoveredTopic, "0x")).toThrow();
  expect(() => restoreDaoAuthoringReview(bytes, "0x1111111111111111111111111111111111111111", recoveredTopic, "0x")).toThrow();
});
