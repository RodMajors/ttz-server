import { WarcraftLogsClient, type WclCurrentUser } from "@ttz/warcraft-logs";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { WclBindingService } from "./wcl-binding.service";

describe("WclBindingService", () => {
  it("consumes a one-time state, links the WCL user and syncs claimed CN characters", async () => {
    let savedSession: Record<string, unknown> | undefined;
    const transaction = {
      wclUserLink: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      character: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      wclOAuthSession: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          savedSession = { ...data, id: 11n, consumedAt: null };
          return savedSession;
        }),
        findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) =>
          savedSession?.stateHash === where.stateHash ? savedSession : null,
        ),
        updateMany: vi.fn(async () => {
          if (savedSession) savedSession.consumedAt = new Date();
          return { count: 1 };
        }),
      },
      wclUserLink: { findUnique: vi.fn().mockResolvedValue(null) },
      classes: { findMany: vi.fn().mockResolvedValue([{ id: 10 }]) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const currentUser: WclCurrentUser = {
      id: 42,
      name: "RodMajors",
      characters: [
        claimedCharacter({ id: 101, canonicalID: 1001, name: "Veliotha", claimed: true, region: "CN" }),
        claimedCharacter({ id: 102, canonicalID: 1002, name: "Unclaimed", claimed: false, region: "CN" }),
        claimedCharacter({ id: 103, canonicalID: 1003, name: "OtherRegion", claimed: true, region: "US" }),
      ],
    };
    vi.spyOn(WarcraftLogsClient.prototype, "exchangeAuthorizationCode").mockResolvedValue({
      accessToken: "user-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    vi.spyOn(WarcraftLogsClient.prototype, "getCurrentUser").mockResolvedValue(currentUser);
    const originalClientId = process.env.WCL_CLIENT_ID;
    const originalClientSecret = process.env.WCL_CLIENT_SECRET;
    const originalRegion = process.env.WCL_REGION;
    const originalRedirect = process.env.WCL_REDIRECT_URI;
    process.env.WCL_CLIENT_ID = "client-id";
    process.env.WCL_CLIENT_SECRET = "client-secret";
    process.env.WCL_REGION = "cn";
    process.env.WCL_REDIRECT_URI = "http://127.0.0.1:3001/api/auth/wcl/callback";

    try {
      const service = new WclBindingService(prisma as unknown as PrismaService);
      const authorization = await service.authorization(7n);
      const authorizationUrl = new URL(authorization.authorizationUrl);
      const state = authorizationUrl.searchParams.get("state") ?? "";
      const result = await service.callback("authorization-code", state);

      expect(result).toEqual({ wclUsername: "RodMajors", synced: 1, conflicts: 0 });
      expect(prisma.wclOAuthSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 11n, consumedAt: null }) }),
      );
      expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
      expect(authorizationUrl.searchParams.has("scope")).toBe(false);
      expect(transaction.wclUserLink.upsert).toHaveBeenCalledOnce();
      expect(transaction.character.create).toHaveBeenCalledOnce();
      expect(transaction.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 7n,
          name: "Veliotha",
          serverSlug: "anzu",
          serverRegion: "cn",
          classId: 10,
          wclId: 101n,
          wclCanonicalId: 1001n,
          wclVerificationStatus: 2,
          wclEvidence: "claimed",
          isMain: 1,
        }),
      });
    } finally {
      restoreEnv("WCL_CLIENT_ID", originalClientId);
      restoreEnv("WCL_CLIENT_SECRET", originalClientSecret);
      restoreEnv("WCL_REGION", originalRegion);
      restoreEnv("WCL_REDIRECT_URI", originalRedirect);
      vi.restoreAllMocks();
    }
  });

  it("rejects a reused or expired OAuth state before calling WCL", async () => {
    const prisma = { wclOAuthSession: { findUnique: vi.fn().mockResolvedValue(null) } };
    const exchange = vi.spyOn(WarcraftLogsClient.prototype, "exchangeAuthorizationCode");
    const originalClientId = process.env.WCL_CLIENT_ID;
    const originalClientSecret = process.env.WCL_CLIENT_SECRET;
    const originalRedirect = process.env.WCL_REDIRECT_URI;
    process.env.WCL_CLIENT_ID = "client-id";
    process.env.WCL_CLIENT_SECRET = "client-secret";
    try {
      const service = new WclBindingService(prisma as unknown as PrismaService);
      await expect(service.callback("code", "bad-state")).rejects.toMatchObject({
        response: { code: "WCL_OAUTH_SESSION_INVALID" },
      });
      expect(exchange).not.toHaveBeenCalled();
    } finally {
      restoreEnv("WCL_CLIENT_ID", originalClientId);
      restoreEnv("WCL_CLIENT_SECRET", originalClientSecret);
      restoreEnv("WCL_REDIRECT_URI", originalRedirect);
      vi.restoreAllMocks();
    }
  });
});

function claimedCharacter(input: { id: number; canonicalID: number; name: string; claimed: boolean; region: string }) {
  return {
    id: input.id,
    canonicalID: input.canonicalID,
    name: input.name,
    classID: 10,
    claimed: input.claimed,
    faction: { id: 1, name: "Horde" },
    server: {
      id: 569,
      slug: "anzu",
      name: "安苏",
      region: { slug: input.region, name: input.region },
    },
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
