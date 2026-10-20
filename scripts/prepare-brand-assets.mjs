import sharp from "sharp";
import { mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// Production exports of the supplied artwork. No tracing, recoloring or redraw.
// Keep the full source, and separate its existing symbol and wordmark at whitespace.
await mkdir("public/brand", { recursive: true });
const source = existsSync("logo.png")
  ? "logo.png"
  : "public/brand/easy4tutor-original.png";
if (source === "logo.png")
  await copyFile(source, "public/brand/easy4tutor-original.png");
await sharp(source)
  .extract({ left: 174, top: 750, width: 906, height: 190 })
  .png()
  .toFile("public/brand/easy4tutor-wordmark.png");
const symbol = await sharp(source)
  .extract({ left: 378, top: 325, width: 498, height: 404 })
  .png()
  .toBuffer();
await sharp(symbol).png().toFile("public/brand/easy4tutor-symbol.png");

// The supplied dark-mode artwork is already composited on the product's navy
// background. Key out that uniform background and crop to the exact artwork;
// this preserves the approved gradient, typography and spacing pixel-for-pixel.
const darkLogoSource = "public/brand/easy4tutor-logo-dark-source.png";
if (existsSync(darkLogoSource)) {
  const { data, info } = await sharp(darkLogoSource)
    .extract({ left: 113, top: 323, width: 1465, height: 283 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const sourceOffset = (y * info.width + x) * info.channels;
      const targetOffset = (y * info.width + x) * 4;
      const red = data[sourceOffset];
      const green = data[sourceOffset + 1];
      const blue = data[sourceOffset + 2];
      const brightness = Math.max(red, green, blue);

      rgba[targetOffset] = red;
      rgba[targetOffset + 1] = green;
      rgba[targetOffset + 2] = blue;
      rgba[targetOffset + 3] = Math.max(
        0,
        Math.min(255, Math.round(((brightness - 40) / 30) * 255)),
      );
    }
  }

  await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile("public/brand/easy4tutor-logo-dark-transparent.png");
}

for (const [path, size] of [
  ["src/app/icon.png", 64],
  ["src/app/apple-icon.png", 180],
]) {
  await sharp(symbol)
    .resize(size - 12, size - 12, { fit: "contain", background: "white" })
    .extend({ top: 6, bottom: 6, left: 6, right: 6, background: "white" })
    .png()
    .toFile(path);
}
