// backend/src/lib/formDelete.js
// Изтриване на форма с всичко нейно — ЕДНО определение за таблото на сървъра
// (routes/forms.js) и за админ конзолата (routes/adminManage.js, v51). Редът е
// важен: кандидатурите, броячите за охлаждане и въпросите падат преди формата.
import { prisma } from "./prisma.js";

export async function deleteFormCascade(formId) {
  await prisma.$transaction(async (tx) => {
    await tx.application.deleteMany({ where: { formId } });
    await tx.formCooldown.deleteMany({ where: { formId } });
    await tx.formQuestion.deleteMany({ where: { formId } });
    await tx.form.delete({ where: { id: formId } });
  });
}
