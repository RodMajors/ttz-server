import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  ASSET_BASE_URL: z.string().default(""),
  COS_SECRET_ID: z.string().default(""),
  COS_SECRET_KEY: z.string().default(""),
  COS_BUCKET: z.string().default(""),
  COS_REGION: z.string().default(""),
  COS_PUBLIC_BASE_URL: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  REDIS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WECHAT_APP_ID: z.string().default(""),
  WECHAT_APP_SECRET: z.string().default(""),
  WCL_CLIENT_ID: z.string().default(""),
  WCL_CLIENT_SECRET: z.string().default(""),
  WCL_REGION: z.enum(["cn", "global"]).default("cn"),
  WCL_GUILD_ID: z.coerce.number().int().positive().default(820881),
  WCL_GUILD_NAME: z.string().trim().min(1).default("TheTwilightZone"),
  WCL_GUILD_SERVER_SLUG: z.string().trim().min(1).default("isillien"),
  WCL_GUILD_SERVER_REGION: z.string().trim().min(1).default("cn"),
  WCL_RAID_ZONE_ID: z.coerce.number().int().positive().default(53),
  WCL_RAID_ZONE_IDS: z
    .string()
    .transform((value) => [...new Set(value.split(",").map((id) => Number(id.trim())))])
    .pipe(z.array(z.number().int().positive()).min(1))
    .optional(),
  WCL_SEASON: z.string().trim().min(1).max(32).default("current"),
  WCL_SEASON_START_AT: z.iso.datetime({ offset: true }).optional(),
  WCL_REDIRECT_URI: z.string().url().default("http://127.0.0.1:3001/api/auth/wcl/callback"),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default("ttz_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
  QR_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  ALLOW_LOCAL_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(input);
}
