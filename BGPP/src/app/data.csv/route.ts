import { enterprisesCsv } from "@/lib/dataset";

export const dynamic = "force-static";

export function GET() {
  return new Response(enterprisesCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="bgpp-predpriyatiya.csv"',
      "cache-control": "public, max-age=3600",
    },
  });
}
