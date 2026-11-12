import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node26",
  packages: "external",
  alias: {
    "@ttz/config": "../../packages/config/src/index.ts",
    "@ttz/database": "../../packages/database/src/index.ts",
    "@ttz/warcraft-logs": "../../packages/warcraft-logs/src/index.ts",
  },
});
