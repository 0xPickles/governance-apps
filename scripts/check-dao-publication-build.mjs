// Run after a build with DAO_PINATA_JWT=dao-publication-build-sentinel (a fake credential).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const root = ".next/static";
const forbidden = ["dao-publication-build-sentinel", "DAO_PINATA_JWT", "DAO_PUBLICATION_DB", "api.pinata.cloud/pinning/pinFileToIPFS"];
let checked = 0;
for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(js|json|map)$/.test(entry.name)) continue;
  const content = await readFile(join(entry.parentPath, entry.name), "utf8");
  if (forbidden.some(value => content.includes(value))) throw new Error("Server publication configuration appeared in a client artifact.");
  checked++;
}
if (checked === 0) throw new Error("No client artifacts found.");
console.log("DAO publication client isolation passed: " + checked + " artifacts.");
