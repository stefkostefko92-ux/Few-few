import { getAndroidApp } from "@/lib/settings";
import { buildAssetlinks } from "@/lib/assetlinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Сервира /.well-known/assetlinks.json (през пренасочване в next.config).
// Свързва Android приложението (TWA) със сайта — за да се отваря на цял екран.
export async function GET() {
  const { packageName, fingerprints } = await getAndroidApp();
  const body = JSON.stringify(buildAssetlinks(packageName, fingerprints), null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
