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
