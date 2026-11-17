import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ttz/database";
import { WarcraftLogsClient, type WclCharacter, type WclRegion } from "@ttz/warcraft-logs";
import { PrismaService } from "../database/prisma.service";

const OAUTH_SESSION_TTL_MS = 10 * 60_000;

@Injectable()
export class WclBindingService {
  private readonly client = new WarcraftLogsClient(
    process.env.WCL_CLIENT_ID ?? "",
    process.env.WCL_CLIENT_SECRET ?? "",
  );

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async authorization(userId: bigint) {
    this.requireConfigured();
    const now = new Date();
    await this.prisma.wclOAuthSession.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] },
    });
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = pkceVerifier();
    const redirectUri = this.redirectUri();
    await this.prisma.wclOAuthSession.create({
      data: {
        userId,
        stateHash: hash(state),
        codeVerifier: encryptVerifier(codeVerifier),
        redirectUri,
        expiresAt: new Date(Date.now() + OAUTH_SESSION_TTL_MS),
      },
    });
    return {
      authorizationUrl: this.client.authorizationUrl({
        redirectUri,
        state,
        codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      }),
    };
  }

  async callback(code: string, state: string) {
    this.requireConfigured();
    const session = await this.prisma.wclOAuthSession.findUnique({ where: { stateHash: hash(state) } });
    if (!session || session.consumedAt || session.expiresAt <= new Date()) {
      throw new ConflictException({ code: "WCL_OAUTH_SESSION_INVALID", message: "WCL 授权会话无效或已过期" });
    }
    const consumed = await this.prisma.wclOAuthSession.updateMany({
      where: { id: session.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date(), codeVerifier: "" },
    });
    if (!consumed.count) {
      throw new ConflictException({ code: "WCL_OAUTH_SESSION_INVALID", message: "WCL 授权会话已被使用" });
    }
    const token = await this.client.exchangeAuthorizationCode({
      code,
      redirectUri: session.redirectUri,
      codeVerifier: decryptVerifier(session.codeVerifier),
    });
    const currentUser = await this.client.getCurrentUser(token.accessToken, this.region());
    return this.persistClaimedCharacters(session.userId, currentUser);
  }

  async status(userId: bigint) {
    const link = await this.prisma.wclUserLink.findUnique({ where: { userId } });
    return {
      linked: Boolean(link),
      wclUserId: link?.wclUserId ?? null,
      wclUsername: link?.wclUsername ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
      lastVerifiedAt: link?.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  async verifyLinkedAccount(userId: bigint) {
    const link = await this.prisma.wclUserLink.findUnique({ where: { userId } });
    if (!link) {
      throw new NotFoundException({ code: "WCL_ACCOUNT_NOT_LINKED", message: "尚未绑定 WCL 账号" });
    }
    return this.authorization(userId);
  }

  async searchCharacter(name: string, serverSlug: string, serverRegion: string) {
    this.requireConfigured();
    const character = await this.client.getCharacter(name, serverSlug, serverRegion, this.region());
    if (!character) {
      throw new NotFoundException({ code: "WCL_CHARACTER_NOT_FOUND", message: "WCL 中未找到该角色" });
    }
    await this.requireClass(character.classID);
    return this.toCandidate(character);
  }

  async listServers(search?: string) {
    await this.ensureServerCache();
    return this.prisma.wclServer.findMany({
      where: {
        region: "cn",
        ...(search?.trim()
          ? { OR: [{ name: { contains: search.trim() } }, { slug: { contains: search.trim().toLowerCase() } }] }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 50,
    });
  }

  async syncReferenceData() {
    this.requireConfigured();
    let page = 1;
    let serverCount = 0;
    let hasMorePages = true;
    while (hasMorePages) {
      const result = await this.client.getChinaServers(page);
      for (const server of result.data) {
        await this.prisma.wclServer.upsert({
          where: { region_slug: { region: "cn", slug: server.slug } },
          create: {
            id: server.id,
            name: server.name,
            slug: server.slug,
            region: "cn",
            blizzardId: server.blizzardID ?? null,
            connectedRealmId: server.connectedRealmID ?? null,
          },
          update: {
            name: server.name,
            slug: server.slug,
            blizzardId: server.blizzardID ?? null,
            connectedRealmId: server.connectedRealmID ?? null,
          },
        });
      }
      serverCount += result.data.length;
      hasMorePages = result.hasMorePages;
      page += 1;
      if (page > 20) throw new Error("WCL server pagination exceeded the safety limit");
    }

    const classDefinitions = await this.client.getClasses(this.region());
    let specCount = 0;
    for (const definition of classDefinitions) {
      const characterClass = await this.prisma.classes.findUnique({ where: { wclId: definition.id } });
      if (!characterClass) continue;
      await this.prisma.classes.update({
        where: { id: characterClass.id },
        data: { wclSlug: definition.slug, name: definition.name },
      });
      for (const spec of definition.specs) {
        const updated = await this.prisma.specs.updateMany({
          where: { class: characterClass.id, wclId: spec.id },
          data: { name: spec.name, wclSlug: spec.slug },
        });
        specCount += updated.count;
      }
    }
    return { serverCount, classCount: classDefinitions.length, specCount };
  }

  private async persistClaimedCharacters(
    userId: bigint,
    currentUser: { id: number; name: string; characters: WclCharacter[] },
  ) {
    const region = this.region();
    const now = new Date();
    const existingLink = await this.prisma.wclUserLink.findUnique({ where: { userId } });
    const switchingAccount = Boolean(existingLink && existingLink.wclUserId !== currentUser.id);
    const claimedCharacters = currentUser.characters.filter(
      (character) =>
        character.claimed === true &&
        character.server.region?.slug?.toLowerCase() === region.toLowerCase() &&
        character.server.slug &&
        character.server.name,
    );
    const claimed = (
      await Promise.all(
        claimedCharacters.map((character) =>
          this.client.getCharacter(character.name, character.server.slug, region, this.region()),
        ),
      )
    ).filter((character): character is WclCharacter => Boolean(character));
    const classes = await this.prisma.classes.findMany({
      where: { wclId: { in: [...new Set(claimed.map((character) => character.classID))] } },
      select: { id: true, wclId: true },
    });
    const classByWclId = new Map(classes.flatMap((entry) => (entry.wclId == null ? [] : [[entry.wclId, entry.id]])));
    let synced = 0;
    let conflicts = 0;
    await this.prisma.$transaction(async (transaction) => {
      const linkedElsewhere = await transaction.wclUserLink.findUnique({
        where: { wclRegion_wclUserId: { wclRegion: region, wclUserId: currentUser.id } },
      });
      if (linkedElsewhere && linkedElsewhere.userId !== userId) {
        throw new ConflictException({ code: "WCL_ACCOUNT_ALREADY_LINKED", message: "该 WCL 账号已绑定其他 TTZ 成员" });
      }
      if (switchingAccount) {
        await transaction.character.updateMany({
          where: { userId, wclEvidence: "claimed" },
          data: {
            wclVerificationStatus: 0,
            wclVerifiedAt: null,
            wclEvidence: null,
            wclVerifiedBy: null,
            wclVerificationNote: null,
          },
        });
      }
      await transaction.wclUserLink.upsert({
        where: { userId },
        create: {
          userId,
          wclUserId: currentUser.id,
          wclUsername: currentUser.name,
          wclRegion: region,
          linkedAt: now,
          lastVerifiedAt: now,
        },
        update: {
          wclUserId: currentUser.id,
          wclUsername: currentUser.name,
          wclRegion: region,
          linkedAt: existingLink?.wclUserId === currentUser.id ? existingLink.linkedAt : now,
          lastVerifiedAt: now,
        },
      });
      let hasMain = Boolean(await transaction.character.findFirst({ where: { userId, isMain: 1 } }));
      for (const character of claimed) {
        const localClassId = classByWclId.get(character.classID);
        if (!localClassId) continue;
        const serverRegion = character.server.region?.slug?.toLowerCase() ?? region;
        const existing = await transaction.character.findFirst({
          where: {
            OR: [
              { serverRegion, wclCanonicalId: BigInt(character.canonicalID) },
              { serverRegion, serverSlug: character.server.slug, name: character.name },
            ],
          },
        });
        if (existing && existing.userId !== userId) {
          conflicts += 1;
          continue;
        }
        const data = {
          name: character.name,
          serverName: character.server.name,
          serverSlug: character.server.slug,
          serverRegion,
          classId: localClassId,
          ...characterProfile(character),
          wclId: BigInt(character.id),
          wclCanonicalId: BigInt(character.canonicalID),
          wclVerificationStatus: 2,
          wclVerifiedAt: now,
          wclEvidence: "claimed",
          wclVerifiedBy: null,
          wclVerificationNote: null,
          isRetired: 0,
        };
        if (existing) {
          await transaction.character.update({
            where: { id: existing.id },
            data: { ...data, ...(existing.isMain ? {} : { isMain: hasMain ? 0 : 1 }) },
          });
          hasMain = true;
        } else {
          await transaction.character.create({
            data: { ...data, userId, isMain: hasMain ? 0 : 1 },
          });
          hasMain = true;
        }
        synced += 1;
      }
    });
    return { wclUsername: currentUser.name, synced, conflicts };
  }

  private async requireClass(classId: number) {
    const characterClass = await this.prisma.classes.findUnique({ where: { wclId: classId } });
    if (!characterClass) {
      throw new ConflictException({ code: "WCL_CLASS_NOT_CONFIGURED", message: "角色职业基础数据尚未配置" });
    }
    return characterClass;
  }

  private async toCandidate(character: WclCharacter) {
    const characterClass = await this.requireClass(character.classID);
    return {
      name: character.name,
      realm: character.server.name,
      serverSlug: character.server.slug,
      serverRegion: character.server.region?.slug?.toLowerCase() ?? this.region(),
      classId: characterClass.id,
      className: characterClass.name ?? characterClass.en_name ?? `职业 ${character.classID}`,
      guildNames: character.guilds?.map((guild) => guild.name) ?? [],
      wclId: String(character.id),
      wclCanonicalId: String(character.canonicalID),
      ...characterProfile(character),
    };
  }

  private async ensureServerCache() {
    const latest = await this.prisma.wclServer.findFirst({ orderBy: { updatedAt: "desc" } });
    if (!latest || latest.updatedAt < new Date(Date.now() - 24 * 60 * 60_000)) {
      await this.syncReferenceData();
    }
  }

  private requireConfigured() {
    if (!process.env.WCL_CLIENT_ID || !process.env.WCL_CLIENT_SECRET) {
      throw new ConflictException({ code: "WCL_NOT_CONFIGURED", message: "WCL API 尚未配置" });
    }
  }

  private redirectUri() {
    return process.env.WCL_REDIRECT_URI ?? "http://127.0.0.1:3001/api/auth/wcl/callback";
  }

  private region(): WclRegion {
    return process.env.WCL_REGION === "global" ? "global" : "cn";
  }
}

function pkceVerifier() {
  return randomBytes(72).toString("base64url");
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function verifierKey() {
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!secret) throw new ConflictException({ code: "WCL_NOT_CONFIGURED", message: "WCL API 尚未配置" });
  return createHash("sha256").update(`ttz:wcl:pkce:${secret}`).digest();
}

function encryptVerifier(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", verifierKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptVerifier(value: string) {
  const bytes = Buffer.from(value, "base64url");
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const encrypted = bytes.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", verifierKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function factionCode(name?: string) {
  if (!name) return null;
  const normalized = name.toLowerCase();
  if (normalized.includes("horde") || normalized.includes("部落")) return 1;
  if (normalized.includes("alliance") || normalized.includes("联盟")) return 0;
  return null;
}

function characterProfile(character: WclCharacter) {
  const raw = asRecord(character.gameData);
  const global = asRecord(raw?.global);
  const guild = asRecord(global?.guild);
  const guildRealm = asRecord(guild?.realm);
  const faction = asRecord(global?.faction);
  const race = asRecord(global?.race);
  const gender = asRecord(global?.gender);
  const activeSpec = asRecord(global?.active_spec);
  const equippedItemLevel = numberValue(global?.equipped_item_level);
  const lastLoginTimestamp = numberValue(global?.last_login_timestamp);
  return {
    faction: factionCode(stringValue(faction?.name) ?? character.faction?.name),
    raceName: stringValue(race?.name),
    gender: stringValue(gender?.name) ?? stringValue(gender?.type),
    guildName: stringValue(guild?.name),
    guildServerName: stringValue(guildRealm?.name),
    guildServerSlug: stringValue(guildRealm?.slug),
    activeSpecName: stringValue(activeSpec?.name),
    level: numberValue(global?.level) ?? character.level ?? null,
    activeTitle: stringValue(asRecord(global?.active_title)?.name),
    serverTypeName: stringValue(global?.server_type_name),
    itemLevel: equippedItemLevel,
    averageItemLevel: numberValue(global?.average_item_level),
    itemLevelUpdatedAt: equippedItemLevel == null ? null : new Date(),
    lastLoginAt: lastLoginTimestamp == null ? null : new Date(lastLoginTimestamp),
    achievementPoints: numberValue(global?.achievement_points),
    gameData: raw ? (raw as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}
