import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  WECHAT_APP_ID: z.string().default(""),
  WECHAT_APP_SECRET: z.string().default(""),
  WCL_CLIENT_ID: z.string().default(""),
  WCL_CLIENT_SECRET: z.string().default(""),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default("ttz_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
  QR_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  ALLOW_DEV_AUTH_HEADER: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(input);
}
