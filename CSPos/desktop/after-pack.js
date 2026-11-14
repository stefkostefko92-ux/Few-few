// electron-builder afterPack: манифест и подпис на компилацията (Прил. № 29, т. 4).
//
// Пуска се след като сървърът е копиран в resources/server на опакованото приложение и ПРЕДИ
// инсталаторът да бъде сглобен. Така хешовете са на файловете точно както ще бъдат инсталирани —
// ако electron-builder пропусне или промени нещо при копирането, манифестът го отразява, вместо
// инсталираната каса да се окаже „променена“ и да откаже да стартира.

"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (process.env.CSPOS_REQUIRE_SIGNATURE === "1" && !process.env.CSPOS_SIGNING_KEY) {
    throw new Error("Релийзът изисква подпис на компилацията (CSPOS_SIGNING_KEY липсва в тайните на CI).");
  }
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const server = path.join(resources, "server");
  execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "integrity-manifest.mjs"), server], {
    stdio: "inherit",
    env: process.env,
  });
};
