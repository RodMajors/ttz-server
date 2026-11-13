import { PrismaClient } from "@ttz/database";
import { LOCAL_DEV_OPENID } from "../src/auth/local-dev-auth.constants";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV !== "development" || !databaseUrl) {
  throw new Error("Local admin seeding requires NODE_ENV=development and DATABASE_URL");
}

const database = new URL(databaseUrl);
const databaseHost = database.hostname.toLowerCase().replace(/^\[|\]$/g, "");
const localHost = databaseHost === "localhost" || databaseHost === "::1" || /^127(?:\.\d{1,3}){3}$/.test(databaseHost);
if (!localHost || database.pathname.replace(/^\//, "") !== "ttz") {
  throw new Error("Refusing to seed outside the local ttz database");
}

const prisma = new PrismaClient();
void seedLocalAdmin();

async function seedLocalAdmin() {
  try {
    const conflictingUser = await prisma.user.findFirst({
      where: { wxNickname: "TTZ Local Dev", openid: { not: LOCAL_DEV_OPENID } },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new Error(`Local seed marker is already used by a different account (user ID ${conflictingUser.id})`);
    }
    const user = await prisma.user.upsert({
      where: { openid: LOCAL_DEV_OPENID },
      create: {
        openid: LOCAL_DEV_OPENID,
        name: "本地开发管理员",
        wxNickname: "TTZ Local Dev",
        guildNickname: "本地开发管理员",
        privilege: 2,
        isApproved: 1,
        status: 1,
      },
      update: {
        name: "本地开发管理员",
        wxNickname: "TTZ Local Dev",
        guildNickname: "本地开发管理员",
        privilege: 2,
        isApproved: 1,
        status: 1,
        rejectReason: null,
      },
      select: { id: true },
    });
    process.stdout.write(`Local development account ready (user ID ${user.id}).\n`);
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.message : "Local development account seeding failed"}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
