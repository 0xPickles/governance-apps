import { describe, expect, it } from "vitest";
import { acceptanceLimits, confirmationAnswer, acceptanceDatabaseRelativePath, readAcceptanceLedger, requireAcceptanceState } from "@/scripts/dao-pinata-acceptance.mjs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
describe("bounded operator acceptance controls", () => {
  it("rejects empty and ambiguous confirmations", () => {
    for (const answer of ["", "y", "YES", " yes ", "nope"]) expect(confirmationAnswer(answer)).toBeNull();
    expect(confirmationAnswer("yes")).toBe(true); expect(confirmationAnswer("no")).toBe(false);
  });
  it("fits the three-document, four-upload session without broadening concurrency", () => {
    expect(acceptanceLimits).toMatchObject({ documents: 3, bytes: 3 * 131072, uploadAttempts: 4, concurrent: 2 });
  });
  it("refuses missing database or request accounting without creating or resetting state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dao-resume-guard-"));
    try {
      await expect(requireAcceptanceState(directory)).rejects.toThrow("Acceptance state is missing");
      await expect(readFile(join(directory, "acceptance-ledger.json"))).rejects.toMatchObject({ code: "ENOENT" });
      const database = join(directory, acceptanceDatabaseRelativePath);
      await mkdir(dirname(database), { recursive: true });
      // Existence guard only; SQLite integrity and fork provenance remain explicit preflight checks.
      await writeFile(database, "synthetic test file");
      await expect(requireAcceptanceState(directory)).rejects.toThrow("Acceptance state is missing");
      const ledger = { version: 1, requests: 6, events: [{ outcome: "reserved" }] };
      await writeFile(join(directory, "acceptance-ledger.json"), JSON.stringify(ledger));
      await requireAcceptanceState(directory);
      expect(await readAcceptanceLedger(directory)).toEqual(ledger);
      await expect(requireAcceptanceState(directory, join(directory, "fork"))).rejects.toThrow("Acceptance state is missing");
      expect(await readAcceptanceLedger(directory)).toEqual(ledger);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
