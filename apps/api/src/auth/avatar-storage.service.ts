import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import COS from "cos-nodejs-sdk-v5";

export type AvatarFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const supportedImages = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

@Injectable()
export class AvatarStorageService {
  async upload(userId: bigint, file: AvatarFile) {
    const extension = supportedImages.get(file.mimetype);
    if (!extension || !hasValidSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException("头像仅支持 JPG、PNG 或 WebP 图片");
    }
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      throw new BadRequestException("头像大小不能超过 2MB");
    }
    const config = storageConfig();
    const key = `avatars/${userId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    await cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: file.mimetype,
      CacheControl: "public, max-age=31536000, immutable",
    });
    return { key, url: `${config.publicBaseUrl}/${key}` };
  }

  async remove(key: string) {
    const config = storageConfig();
    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    await cos.deleteObject({ Bucket: config.bucket, Region: config.region, Key: key });
  }
}

function storageConfig() {
  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  const publicBaseUrl = (process.env.COS_PUBLIC_BASE_URL || process.env.ASSET_BASE_URL)?.trim().replace(/[/]+$/, "");
  if (!secretId || !secretKey || !bucket || !region || !publicBaseUrl) {
    throw new ServiceUnavailableException("头像存储尚未配置，请稍后在个人资料中补充头像");
  }
  return { secretId, secretKey, bucket, region, publicBaseUrl };
}

function hasValidSignature(buffer: Buffer, mimetype: string) {
  if (mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (mimetype === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}
