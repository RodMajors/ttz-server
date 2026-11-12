import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { AuthService, hash } from "./auth.service";

describe("AuthService QR session state machine", () => {
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
    const service = createService({
      loginSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          userId: 7n,
          status: 2,
          expireAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
        updateMany,
      },
      authSession: { create: authSessionCreate },
    });

    const result = await service.pollQr("login-no", "browser-secret");

    expect(result.status).toBe("CONFIRMED");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 11n, status: 2, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(authSessionCreate).toHaveBeenCalledOnce();
  });
});

function member() {
  return { id: 7n, name: "Member", privilege: 0 as const, isApproved: true, status: 1 };
}

function createService(prisma: Record<string, unknown>) {
  return new AuthService(prisma as unknown as PrismaService);
}
