import "server-only";
import crypto from "node:crypto";

// Meal photos are stored in the photos table (see lib/db.ts); meals keep only the name.
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const EXT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp" };
export const PHOTO_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const isPhotoName = (s: string) => NAME.test(s);
export const photoUrl = (name: string | null) => (name ? `/api/photos/${name}` : null);

export type PhotoData = { name: string; contentType: string; data: Buffer };

/** Decodes a data: URL image and gives it a fresh random name. */
export function parsePhotoData(dataUrl: string): PhotoData {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Not an image data URL");
  const ext = EXT[m[1]];
  return { name: `${crypto.randomUUID()}.${ext}`, contentType: PHOTO_TYPES[ext], data: Buffer.from(m[2], "base64") };
}
