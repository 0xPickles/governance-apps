// Local saved-scenario feed and public-forum response fixture. No forum posts.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET") { response.writeHead(405).end(); return; }
  try {
    if (request.url === "/dao.json") response.end(await readFile(directory + "/feed.json"));
    else if (request.url === "/t/1234.json") response.end(JSON.stringify({ id: 1234, slug: "local-fork-uat", title: "Local fork UAT", category_id: 5,
      created_at: "2026-09-10T00:00:00Z", visible: true, archetype: "regular", post_stream: { posts: [{ username: "local-test" }] } }));
    else if (request.url === "/c/5/show.json") response.end(JSON.stringify({ category: { id: 5, name: "Proposals", slug: "proposals", parent_category_id: null } }));
    else response.writeHead(404).end();
  } catch { response.writeHead(503).end(); }
});
server.listen(Number(process.env.DAO_LOCAL_SERVICES_PORT ?? 18546), "127.0.0.1", () => console.log("Local DAO services ready."));
