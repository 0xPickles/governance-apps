// Check local file targets only. Historical external references are not fetched.
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";

const root = resolve("docs/apps/dao");
let checked = 0;
const failures = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { await visit(file); continue; }
    if (!file.endsWith(".md")) continue;
    const tree = fromMarkdown(await readFile(file, "utf8"));
    async function walk(node) {
      if (["link", "image", "definition"].includes(node.type)) {
        const href = node.url.split("#")[0];
        if (href && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) {
          checked++;
          try { await stat(resolve(dirname(file), decodeURIComponent(href))); }
          catch { failures.push(file + ": " + href); }
        }
      }
      for (const child of node.children ?? []) await walk(child);
    }
    await walk(tree);
  }
}
await visit(root);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log(`DAO Markdown local file targets passed: ${checked}. Anchors and external URLs were not checked.`);
