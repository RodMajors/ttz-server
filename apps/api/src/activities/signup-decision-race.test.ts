import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("signup decision serialization", () => {
  it("locks the activity version before updating a signup without enforcing display guidance", async () => {
    const calls: string[] = [];
    const transaction = {
      activity: {
        update: vi.fn().mockImplementation(async () => {
          calls.push("lock");
          return { status: 1 };
        }),
      },
      activitySignup: {
        findFirst: vi.fn().mockImplementation(async () => {
          calls.push("find");
          return { id: 8n, status: 0 };
        }),
        update: vi.fn().mockImplementation(async () => {
          calls.push("update");
          return { id: 8n };
        }),
      },
    };
    const prisma = {
      activity: { findFirst: vi.fn().mockResolvedValue({ id: 1n, creator: 3n, status: 1 }) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new ActivitiesService(prisma as unknown as PrismaService);

    await service.decide(1n, 8n, { status: "CONFIRMED", orderIndex: 0 }, leader());

    expect(calls).toEqual(["lock", "find", "update"]);
    expect(transaction.activity.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { version: { increment: 1 } },
      select: { status: true },
    });
  });
});

function leader() {
  return {
    id: 3n,
    name: "Leader",
    wxNickname: "Leader",
    guildNickname: "Leader",
    privilege: 0 as const,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
