const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("═══ Seed: структурни данни ═══");

  const roles = [
    { id:"SUPER_ADMIN", label:"Супер Админ", canEdit:true, canDelete:true, canCreate:true, canOrder:true, canSeePrice:true, canManageUsers:true, canAudit:true, canSettings:true, isBuiltin:true },
    { id:"ADMIN", label:"Админ", canEdit:true, canDelete:true, canCreate:true, canOrder:true, canSeePrice:true, canManageUsers:false, canAudit:false, canSettings:false, isBuiltin:true },
    { id:"VIEWER_PRICE", label:"Преглед (с цена)", canEdit:false, canDelete:false, canCreate:false, canOrder:false, canSeePrice:true, canManageUsers:false, canAudit:false, canSettings:false, isBuiltin:true },
    { id:"VIEWER", label:"Преглед", canEdit:false, canDelete:false, canCreate:false, canOrder:false, canSeePrice:false, canManageUsers:false, canAudit:false, canSettings:false, isBuiltin:true },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { id: r.id }, update: {}, create: r });
  }
  console.log("  ✓ " + roles.length + " роли");

  await prisma.settings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  console.log("  ✓ Настройки");

  const uc = await prisma.user.count();
  const pc = await prisma.part.count();
  const oc = await prisma.order.count();
  console.log("  ℹ Потребители: " + uc + ", Артикули: " + pc + ", Поръчки: " + oc);
  console.log("═══ Готово ═══");
}

main().catch(console.error).finally(() => prisma.$disconnect());
