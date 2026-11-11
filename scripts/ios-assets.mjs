import sharp from "sharp";

const src = "public/icon-1024.png";
const assets = "ios/App/App/Assets.xcassets";

await sharp(src)
  .resize(1024, 1024)
  .flatten({ background: "#000000" })
  .removeAlpha()
  .png()
  .toFile(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`);

const icon = await sharp(src).resize(512, 512).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 3, background: "#000000" },
})
  .composite([{ input: icon, gravity: "center" }])
  .removeAlpha()
  .png()
  .toBuffer();

for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await sharp(splash).toFile(`${assets}/Splash.imageset/${name}`);
}
console.log("iOS assets written");
