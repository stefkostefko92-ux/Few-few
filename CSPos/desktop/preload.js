// Минимален preload — контекстна изолация е включена, нищо от Node не се
// излага към уеб съдържанието. Тук само маркираме, че тичаме в десктоп обвивка
// (полезно за бъдещи нативни функции: печат, чекмедже, сериен порт).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("carbonStealthPOS", {
  desktop: true,
  version: process.env.npm_package_version || "1.0.0",
});
