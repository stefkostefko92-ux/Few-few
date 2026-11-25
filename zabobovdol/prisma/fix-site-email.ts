import { prisma } from "./_seedlib";

// Еднократна смяна на имейла на сайта във ВЕЧЕ засетите записи (seed-ът върви
// само при първо пускане): zabobovdol@carbonstealth.eu → info@carbonstealth.eu
// (собственикът, 16.11.2026). Сменя само полета, които са ТОЧНО старият адрес —
// адрес, въведен от човек, не се пипа. Безопасно е да се пусне повече от веднъж.
//   npm run db:fix:email

const OLD = "zabobovdol@carbonstealth.eu";
const NEW = "info@carbonstealth.eu";

async function main() {
  const [help, volunteers, rides] = await Promise.all([
    prisma.helpCause.updateMany({ where: { contactEmail: OLD }, data: { contactEmail: NEW } }),
    prisma.volunteer.updateMany({ where: { email: OLD }, data: { email: NEW } }),
    prisma.rideshare.updateMany({ where: { contactEmail: OLD }, data: { contactEmail: NEW } }),
  ]);
  console.log(
    `✔ Имейлът на сайта → ${NEW}: зов за помощ ${help.count}, доброволци ${volunteers.count}, пътувания ${rides.count}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
