import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "mysql://validation:validation@127.0.0.1:3306/ttz",
};
const command = process.platform === "win32" ? "prisma.cmd" : "prisma";
const result = spawnSync(command, ["validate"], {
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
