import { describe, expect, it } from "vitest";
import { AvatarStorageService } from "./avatar-storage.service";

describe("AvatarStorageService", () => {
  const service = new AvatarStorageService();

  it("rejects a file whose content does not match its image type", async () => {
    await expect(
      service.upload(7n, { buffer: Buffer.from("not an image"), mimetype: "image/png", size: 12 }),
    ).rejects.toMatchObject({ response: { message: "头像仅支持 JPG、PNG 或 WebP 图片" } });
  });

  it("rejects an image larger than two megabytes before uploading", async () => {
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    Buffer.from("89504e470d0a1a0a", "hex").copy(buffer);
    await expect(service.upload(7n, { buffer, mimetype: "image/png", size: buffer.length })).rejects.toMatchObject({
      response: { message: "头像大小不能超过 2MB" },
    });
  });
});
