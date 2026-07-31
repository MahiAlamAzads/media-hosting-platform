import { readdir, stat } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
async function walk(d) {
  let r = [];
  for (const n of await readdir(d)) {
    const a = path.join(d, n),
      s = await stat(a);
    r.push(...(s.isDirectory() ? await walk(a) : [a]));
  }
  return r;
}
const bad = (await walk(path.join(root, "src"))).filter((f) =>
  f.endsWith(".test.ts"),
);
if (bad.length) {
  console.error("Tests are not allowed in src:", bad);
  process.exit(1);
}
const good = (await walk(path.join(root, "tests"))).filter((f) =>
  f.endsWith(".test.ts"),
);
if (!good.length) process.exit(1);
console.log(`PASS: ${good.length} tests centralized.`);
