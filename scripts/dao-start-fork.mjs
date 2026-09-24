// Disposable fork launcher. The upstream is used only by Anvil for chain reads.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
if (!process.env.DAO_FORK_SOURCE_RPC) require("@next/env").loadEnvConfig(process.cwd());
const source = process.env.DAO_FORK_SOURCE_RPC ?? process.env.NEXT_PUBLIC_RPC_URLS?.split(",")[0]?.trim();
if (!source) throw new Error("Set DAO_FORK_SOURCE_RPC to the approved upstream RPC.");
const port = process.env.DAO_FORK_PORT ?? "18545";
if (!/^[0-9]+$/.test(port)) throw new Error("Invalid local fork port.");
const child = spawn(process.env.ANVIL ?? "anvil", [
  "--host", "127.0.0.1", "--port", port, "--chain-id", "1",
  "--fork-url", source, "--silent",
], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", () => { /* The node can include private upstream URLs in diagnostics. */ });
child.on("error", () => { console.error("Could not start the disposable fork."); process.exitCode = 1; });
child.on("exit", code => { if (code) { console.error("Disposable fork stopped with exit code " + code); process.exitCode = code; } });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
console.log("Disposable fork RPC: http://127.0.0.1:" + port);
