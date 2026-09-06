import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";

async function main() {
  const src = join(process.cwd(), "public", "icons", "icon-source.png");
  const dir = join(process.cwd(), "public", "icons");
  mkdirSync(dir, { recursive: true });
  const input = readFileSync(src);
  for (const size of [192, 512]) {
    const out = await sharp(input).resize(size, size).png().toBuffer();
    writeFileSync(join(dir, `icon-${size}.png`), out);
    console.log(`wrote icon-${size}.png`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
