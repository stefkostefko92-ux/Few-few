import { getIndexNowKey } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ключовият файл за IndexNow — търсачките го теглят, за да потвърдят, че сме
// собственици на сайта. Връща точно ключа (без нищо друго).
export async function GET() {
  const key = await getIndexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
