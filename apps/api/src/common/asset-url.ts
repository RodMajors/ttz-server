/** Convert a stored WoW object key into the current public asset URL. */
export function assetUrl(objectKey: string | null | undefined): string | null {
  const base = process.env.ASSET_BASE_URL?.trim().replace(/\/+$/, "");
  const key = objectKey?.trim().replace(/^\/+/, "");
  if (!base || !key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const pngKey = key.replace(/\.blp$/i, ".png");
  return `${base}/${pngKey.split("/").map(encodeURIComponent).join("/")}`;
}
