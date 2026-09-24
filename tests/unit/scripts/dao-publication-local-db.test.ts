// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { localDatabase } from "@/scripts/dao-publication-local-db.mjs";
import { acceptanceDatabaseRelativePath } from "@/scripts/dao-pinata-acceptance.mjs";

describe("file-based local publication initialization", () => {
  it("initializes only a new directory and resumes without changing accounting", async () => {
    const parent = await mkdtemp(join(tmpdir(), "dao-db-regression-"));
    const directory = join(parent, "fresh-session");
    try {
      expect(await localDatabase("fresh", directory)).toMatchObject({ documents: 0, policies: 0, helperRequests: 0, integrity: "ok" });
      const path = join(directory, acceptanceDatabaseRelativePath);
      const db = new DatabaseSync(path);
      db.prepare("INSERT INTO dao_publications (digest,cid,content,byte_length,admitted_at,upload_attempts,reservations) VALUES ('test','test',X'01',1,1,2,2)").run();
      db.close();
      const original = await readFile(path);
      const ledger = await readFile(join(directory, "acceptance-ledger.json"));
      expect(await localDatabase("resume", directory)).toMatchObject({ documents: 1, helperRequests: 0 });
      await expect(localDatabase("fresh", directory)).rejects.toThrow();
      expect(await readFile(path)).toEqual(original);
      expect(await readFile(join(directory, "acceptance-ledger.json"))).toEqual(ledger);
      const missing = join(parent, "missing-session");
      await expect(localDatabase("resume", missing)).rejects.toThrow();
      await expect(stat(missing)).rejects.toThrow();
    } finally { await rm(parent, { recursive: true, force: true }); }
  }, 40_000);
});
