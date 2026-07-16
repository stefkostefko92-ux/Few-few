import { fullDataset } from "@/lib/dataset";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(fullDataset(), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'inline; filename="bgpp-dataset.json"',
      "cache-control": "public, max-age=3600",
    },
  });
}
