// Активните промоции за POS екрана — за да покаже промо цена и етикет.
// Клиентът показва информативно; сървърът остойностява официално при продажба.

import { guard, requireSession } from "@/lib/auth";
import { fetchActivePromotions } from "@/lib/promotions-db";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const promotions = await fetchActivePromotions(new Date());
    return Response.json({ promotions });
  });
}
