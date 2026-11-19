// Small runner shared by the harness and Schema C: run the entry (node
// main.ts) against one input directory, twice for determinism, timing each
// run. Returns { outDir, ms1, ms2, sha1, sha2, stderr }.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ENTRY_DIR = new URL("..", import.meta.url).pathname;

export function runEntry(inputDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const env = {
    ...process.env,
    MAKEFUN_INPUT_DIR: inputDir,
    MAKEFUN_OUTPUT_DIR: outputDir,
  };
  const t1 = process.hrtime.bigint();
  execFileSync("node", ["main.ts"], { cwd: ENTRY_DIR, env, stdio: "pipe" });
  const ms1 = Number(process.hrtime.bigint() - t1) / 1e6;
  const files = readdirSync(outputDir).filter((f) => f.endsWith(".out")).sort();
  const first = {};
  for (const f of files) {
    first[f] = createHash("sha256")
      .update(readFileSync(join(outputDir, f)))
      .digest("hex");
  }
  const t2 = process.hrtime.bigint();
  execFileSync("node", ["main.ts"], { cwd: ENTRY_DIR, env, stdio: "pipe" });
  const ms2 = Number(process.hrtime.bigint() - t2) / 1e6;
  const second = {};
  for (const f of files) {
    second[f] = createHash("sha256")
      .update(readFileSync(join(outputDir, f)))
      .digest("hex");
  }
  const deterministic = files.every((f) => first[f] === second[f]);
  return { files, ms1, ms2, first, second, deterministic };
}
