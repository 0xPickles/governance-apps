import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const server = await createServer({ configFile: resolve(root, "vitest.config.mts"),
  server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const schema = await server.ssrLoadModule("/lib/schemas/dao-feed.ts");
  const { adaptDaoFeed } = await server.ssrLoadModule("/lib/clients/dao/feed-adapter.ts");
  const fixtures = await server.ssrLoadModule("/tests/fixtures/dao-feed-v2.ts");
  const example = JSON.parse(await readFile("docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json", "utf8"));
  const generated = await readFile("docs/apps/dao/feed-schema-v2.schema.json", "utf8");
  const source = await readFile("lib/schemas/dao-feed.ts", "utf8");
  const measure = (run, iterations) => {
    run();
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run();
    return (performance.now() - started) / iterations;
  };
  const cases = [example, fixtures.createV2GrowthExample()];
  const result = {
    node: process.version, platform: process.platform, arch: process.arch,
    conditions: "Vite SSR module load, one warmup, 10 serial iterations per operation, wall time; JSON parse included; no RPC/network/rendering",
    schemaSourceBytes: Buffer.byteLength(source), schemaSourceLines: source.trimEnd().split("\n").length,
    generatedSchemaBytes: Buffer.byteLength(generated),
    generatedSchemaMinifiedBytes: Buffer.byteLength(JSON.stringify(JSON.parse(generated))),
    cases: cases.map(feed => {
      const bytes = JSON.stringify(feed);
      return { proposals: feed.proposals.length,
        events: feed.proposals.reduce((sum, p) => sum + p.events.length, 0),
        minifiedPayloadBytes: Buffer.byteLength(bytes),
        parseMeanMs: measure(() => schema.parseDaoFeedResponse(bytes), 10),
        parseAndAdaptMeanMs: measure(() => adaptDaoFeed(schema.parseDaoFeedResponse(bytes), fixtures.V2_DEPLOYMENTS), 10) };
    }),
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally { await server.close(); }
