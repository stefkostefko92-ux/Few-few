import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/auth/password.js';

const prisma = new PrismaClient();

const categories: ReadonlyArray<{ slug: string; nameBg: string; icon: string }> = [
  { slug: 'bokluk', nameBg: 'Боклук', icon: 'trash-can-outline' },
  { slug: 'dupki', nameBg: 'Дупки по пътя', icon: 'road-variant' },
  { slug: 'osvetlenie', nameBg: 'Осветление', icon: 'lightbulb-outline' },
  { slug: 'vik', nameBg: 'ВиК', icon: 'water-outline' },
  { slug: 'zelenina', nameBg: 'Зеленина и дървета', icon: 'tree-outline' },
  { slug: 'jivotni', nameBg: 'Бездомни животни', icon: 'paw-outline' },
  { slug: 'nezakonno', nameBg: 'Незаконно', icon: 'home-alert-outline' },
  { slug: 'drugo', nameBg: 'Друго', icon: 'dots-horizontal-circle-outline' },
];

const settlements: ReadonlyArray<{ slug: string; nameBg: string; isTown: boolean }> = [
  { slug: 'bobov-dol', nameBg: 'Бобов дол', isTown: true },
  { slug: 'babino', nameBg: 'Бабино', isTown: false },
  { slug: 'babinska-reka', nameBg: 'Бабинска река', isTown: false },
  { slug: 'blato', nameBg: 'Блато', isTown: false },
  { slug: 'golema-fucha', nameBg: 'Голема Фуча', isTown: false },
  { slug: 'golem-varbovnik', nameBg: 'Голем Върбовник', isTown: false },
  { slug: 'goliamo-selo', nameBg: 'Голямо село', isTown: false },
  { slug: 'gorna-koznica', nameBg: 'Горна Козница', isTown: false },
  { slug: 'dolistovo', nameBg: 'Долистово', isTown: false },
  { slug: 'korkina', nameBg: 'Коркина', isTown: false },
  { slug: 'lokvata', nameBg: 'Локвата', isTown: false },
  { slug: 'mala-fucha', nameBg: 'Мала Фуча', isTown: false },
  { slug: 'malo-selo', nameBg: 'Мало село', isTown: false },
  { slug: 'mali-varbovnik', nameBg: 'Мали Върбовник', isTown: false },
  { slug: 'mlamolovo', nameBg: 'Мламолово', isTown: false },
  { slug: 'novoseliane', nameBg: 'Новоселяне', isTown: false },
  { slug: 'panicharevo', nameBg: 'Паничарево', isTown: false },
  { slug: 'shatrovo', nameBg: 'Шатрово', isTown: false },
];

async function main(): Promise<void> {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { nameBg: c.nameBg, icon: c.icon },
      create: c,
    });
  }
  for (const s of settlements) {
    await prisma.settlement.upsert({
      where: { slug: s.slug },
      update: { nameBg: s.nameBg, isTown: s.isTown },
      create: s,
    });
  }
  console.log(
    `Seed готов: ${categories.length} категории, ${settlements.length} населени места.`,
  );

  // Първоначален админ — само ако са зададени ADMIN_EMAIL и ADMIN_PASSWORD.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const passHash = await hashPassword(adminPassword);
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      update: { passHash, active: true, role: 'ADMIN' },
      create: { email: adminEmail, passHash, role: 'ADMIN' },
    });
    console.log(`Админ готов: ${adminEmail} (роля ADMIN).`);
  } else {
    console.log('Без админ seed (липсват ADMIN_EMAIL / ADMIN_PASSWORD).');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
