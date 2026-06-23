// Digital Asset Links — файлът, който свързва Android приложението (TWA) със
// сайта, за да се отваря на цял екран без адресната лента на браузъра.
// Файлът се сервира на https://<домейн>/.well-known/assetlinks.json.
// Чиста логика (без база/UI) — за лесно тестване.

export const DEFAULT_ANDROID_PACKAGE = "eu.carbonstealth.zabobovdol";

// Разделя въведените отпечатъци (SHA-256) — по нов ред или запетая — и ги
// нормализира до главни букви с двоеточия (форматът, който дава Google Play).
export function parseFingerprints(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[0-9A-F]{2}(:[0-9A-F]{2})+$/.test(s)),
    ),
  );
}

export type AssetLinkStatement = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

// Изгражда съдържанието на assetlinks.json. Връща празен масив, докато няма
// валидни данни (тогава приложението още не е свързано — това е нормално).
export function buildAssetlinks(
  packageName: string,
  fingerprints: string[],
): AssetLinkStatement[] {
  const pkg = packageName.trim();
  const fps = fingerprints.filter(Boolean);
  if (!pkg || fps.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: pkg,
        sha256_cert_fingerprints: fps,
      },
    },
  ];
}
