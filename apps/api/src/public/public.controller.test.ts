import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { SiteSettingsController } from "./public.controller";

describe("SiteSettingsController", () => {
  it("records the administrator updating structured public content", async () => {
    const upsert = vi.fn().mockResolvedValue({ jsonValue: { tagline: "Updated" } });
    const controller = new SiteSettingsController({ siteSetting: { upsert } } as unknown as PrismaService);

    const body = {
      name: "TTZ",
      tagline: "Updated",
      description: "Guild",
      realm: "伊森利恩",
      faction: "部落",
      schedule: [],
      highlights: [],
    };
    await expect(controller.put(admin(), "guild_profile", body)).resolves.toEqual({
      tagline: "Updated",
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: "guild_profile" },
      create: { key: "guild_profile", jsonValue: body, updatedBy: 3n },
      update: { jsonValue: body, updatedBy: 3n },
    });
  });
});

function admin() {
  return {
    id: 3n,
    name: "Admin",
    wxNickname: "Admin",
    guildNickname: "Admin",
    privilege: 1 as const,
    isApproved: true,
    approvalStatus: "APPROVED" as const,
    rejectReason: null,
    profileComplete: true,
    status: 1,
  };
}
