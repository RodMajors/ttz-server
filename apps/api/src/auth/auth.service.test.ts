import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { AuthService, hash } from "./auth.service";

describe("AuthService QR session state machine", () => {
  it("rejects a refresh token already rotated by another request", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = createService({
      authSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1n,
          revokedAt: null,
          refreshExpiresAt: new Date(Date.now() + 60000),
          user: {
            id: 7n,
            name: "Member",
            guildNickname: null,
            wxNickname: null,
            privilege: 0,
            isApproved: 1,
            status: 1,
          },
        }),
        updateMany,
      },
    });
    await expect(service.refresh("refresh-token")).rejects.toMatchObject({
      response: { code: "REFRESH_TOKEN_INVALID" },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ refreshTokenHash: hash("refresh-token"), revokedAt: null }),
      }),
    );
  });
  it("scans only a pending, unexpired session with the correct nonce", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = createService({ loginSession: { updateMany } });

    await expect(service.scanQr("login-no", "nonce", member())).resolves.toEqual({ status: "SCANNED" });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        loginNo: "login-no",
        nonceHash: hash("nonce"),
        status: 0,
        expireAt: { gt: expect.any(Date) },
      },
      data: { status: 1, userId: 7n, scannedAt: expect.any(Date) },
    });
  });

  it("rejects a QR session after the atomic state transition loses the race", async () => {
    const service = createService({ loginSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(service.scanQr("login-no", "nonce", member())).rejects.toMatchObject({
      response: { code: "QR_SESSION_INVALID" },
    });
  });

  it("consumes a confirmed browser session once and creates a web session", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const authSessionCreate = vi.fn().mockImplementation(({ data }) => ({ id: 33n, ...data }));
    const transaction = { loginSession: { updateMany }, authSession: { create: authSessionCreate } };
    const service = createService({
      loginSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          userId: 7n,
          status: 2,
          expireAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
      },
      $transaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => fn(transaction)),
    });

    const result = await service.pollQr("login-no", "a".repeat(43));

    expect(result.status).toBe("CONFIRMED");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 11n, status: 2, consumedAt: null, expireAt: { gt: expect.any(Date) }, user: { status: 1 } },
      data: { consumedAt: expect.any(Date) },
    });
    expect(authSessionCreate).toHaveBeenCalledOnce();
  });

  it("rejects a missing browser secret before querying the database", async () => {
    const findFirst = vi.fn();
    const service = createService({ loginSession: { findFirst } });
    await expect(service.pollQr("login-no", "")).rejects.toMatchObject({
      response: { code: "QR_SESSION_INVALID" },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not issue a session when the QR code expires during consumption", async () => {
    const authSessionCreate = vi.fn();
    const transaction = {
      loginSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      authSession: { create: authSessionCreate },
    };
    const service = createService({
      loginSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          userId: 7n,
          status: 2,
          expireAt: new Date(Date.now() + 1000),
          consumedAt: null,
        }),
      },
      $transaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => fn(transaction)),
    });
    await expect(service.pollQr("login-no", "a".repeat(43))).rejects.toMatchObject({
      response: { code: "QR_SESSION_INVALID" },
    });
    expect(authSessionCreate).not.toHaveBeenCalled();
  });
});

function member() {
  return {
    id: 7n,
    name: "Member",
    wxNickname: "微信成员",
    guildNickname: "公会成员",
    privilege: 0 as const,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}

function createService(prisma: Record<string, unknown>) {
  return new AuthService(prisma as unknown as PrismaService);
}
