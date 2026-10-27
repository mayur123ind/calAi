// Browser-only helpers: shrink a camera photo before it leaves the device.

export type PreparedPhoto = {
  preview: string; // data URL, max 1024px, sent to Gemini
  base64: string; // the same image without the data: prefix
  thumb: string; // 240px square data URL, stored with the meal
};

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const big = document.createElement("canvas");
    big.width = w;
    big.height = h;
    big.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const preview = big.toDataURL("image/jpeg", 0.82);

    const side = Math.min(bitmap.width, bitmap.height);
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 240;
    thumbCanvas.height = 240;
    thumbCanvas
      .getContext("2d")!
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 240, 240);
    const thumb = thumbCanvas.toDataURL("image/jpeg", 0.72);

    return { preview, base64: preview.split(",")[1], thumb };
  } finally {
    bitmap.close();
  }
}
