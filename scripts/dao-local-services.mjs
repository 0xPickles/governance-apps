// Local saved-scenario feed and public-forum response fixture. No forum posts.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
const directory = process.env.DAO_FORK_DIR ?? "/tmp/governance-dao-uat";
const ipfs = new URL(process.env.DAO_LOCAL_IPFS_API_URL ?? "http://127.0.0.1:15001");
if (ipfs.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(ipfs.hostname) || ipfs.username || ipfs.password) {
  throw new Error("The local content seam requires loopback Kubo.");
}
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  try {
    // Disposable local provider seam: same multipart contract, offline Kubo persistence.
    if (request.method === "POST" && request.url === "/pinning/pinFileToIPFS") {
      const input = new Request("http://localhost" + request.url, { method: "POST", headers: request.headers,
        body: Readable.toWeb(request), duplex: "half" });
      const multipart = await input.formData();
      const options = JSON.parse(multipart.get("pinataOptions"));
      if (options.cidVersion !== 1 || options.wrapWithDirectory !== false) throw new Error("Wrong upload configuration");
      const body = new FormData();
      body.append("file", multipart.get("file"));
      const result = await fetch(ipfs.origin + "/api/v0/block/put?cid-codec=raw&mhtype=sha2-256&mhlen=32&pin=true", {
        method: "POST", body, signal: AbortSignal.timeout(15_000),
      });
      if (!result.ok) throw new Error("Local content unavailable");
      const block = await result.json();
      response.end(JSON.stringify({ IpfsHash: block.Key, PinSize: block.Size }));
      return;
    }
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    if (/^\/ipfs\/bafkrei[a-z2-7]{52}$/.test(request.url)) {
      if (request.headers.authorization) throw new Error("Gateway credentials are forbidden");
      const result = await fetch(ipfs.origin + "/api/v0/block/get?arg=" + request.url.slice(6), {
        method: "POST", signal: AbortSignal.timeout(15_000),
      });
      response.writeHead(result.status, { "Content-Type": "application/octet-stream" });
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (request.url === "/dao.json") response.end(await readFile(directory + "/feed.json"));
    else if (request.url === "/t/1234.json") response.end(JSON.stringify({ id: 1234, slug: "local-fork-uat", title: "Local fork UAT", category_id: 5,
      created_at: "2026-09-10T00:00:00Z", visible: true, archetype: "regular", post_stream: { posts: [{ username: "local-test" }] } }));
    else if (request.url === "/c/5/show.json") response.end(JSON.stringify({ category: { id: 5, name: "Proposals", slug: "proposals", parent_category_id: null } }));
    else response.writeHead(404).end();
  } catch { response.writeHead(503).end(); }
});
server.listen(Number(process.env.DAO_LOCAL_SERVICES_PORT ?? 18546), "127.0.0.1", () => console.log("Local DAO services ready."));
