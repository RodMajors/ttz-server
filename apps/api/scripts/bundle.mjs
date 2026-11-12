import { build } from "esbuild";

await build({
  entryPoints: ["dist/main.js"],
  outfile: "dist/server.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node26",
  packages: "external",
  alias: {
    "@ttz/config": "../../packages/config/src/index.ts",
    "@ttz/contracts": "../../packages/contracts/src/index.ts",
    "@ttz/database": "../../packages/database/src/index.ts",
  },
});
