import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const root = process.cwd(),
  m = JSON.parse(
    readFileSync(path.join(root, "module-architecture.json"), "utf8"),
  );
describe("OOP module architecture", () => {
  it("contains all required layers", () => {
    for (const mod of m.modules)
      for (const l of m.requiredLayers)
        expect(
          existsSync(
            path.join(
              root,
              "src/modules",
              mod.directory,
              `${mod.stem}.${l}.ts`,
            ),
          ),
          `${mod.name}:${l}`,
        ).toBe(true);
  });
  it("uses central module registry", () =>
    expect(readFileSync(path.join(root, "src/app.ts"), "utf8")).toContain(
      "for (const module of apiModules)",
    ));
});
