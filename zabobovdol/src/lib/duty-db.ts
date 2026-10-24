import "server-only";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats-core";
import { DUTY_DAYS_AHEAD, dutyRange, pickDuty } from "@/lib/duty";

// Графикът на дежурните аптеки за днес и следващите дни — за /dezhurna-apteka
// и за панела „Днес“ на началната. „Днес“ е денят в София.
export async function getDutySchedule(now: Date = new Date(), daysAhead = DUTY_DAYS_AHEAD) {
  const today = sofiaDay(now);
  const rows = await prisma.dutyRoster.findMany({
    where: { published: true, date: dutyRange(today, daysAhead) },
    orderBy: [{ date: "asc" }, { pharmacy: "asc" }],
    select: {
      id: true,
      date: true,
      pharmacy: true,
      address: true,
      phone: true,
      hours: true,
      note: true,
    },
  });
  const picked = pickDuty(rows, today, daysAhead);
  // day — днешният ден (полунощ по UTC); today — записите за днес.
  return { day: today, today: picked.today, upcoming: picked.upcoming };
}

export type DutyEntry = Awaited<ReturnType<typeof getDutySchedule>>["today"][number];
