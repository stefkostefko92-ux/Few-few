import assert from 'node:assert/strict';
import type { User } from '@prisma/client';
import {
  cite,
  makeUser,
  signIn,
  type Client,
  type Harness,
  type PackItem,
  type Plan,
} from './helpers.js';
import { ask, newCase, type World } from './world.js';

/**
 * Фикстури за работния поток (FR-09, FR-19, §11.2): отговор с ДВЕ стъпки — диагностична и по
 * безопасност (документирана от публикуваната процедура PROC-DOOR-001, затова Gate я пуска с
 * `requiresConfirmation`) — и допълнителни хора: инженер, втори служител, служител на клиент B.
 */

export const DIAG = 'Leggere il codice errore sul display del quadro.';
export const SAFETY = 'Verificare il contatto porta di piano con il multimetro.';
export const QUESTION = 'Come verifico il contatto porta di piano con il multimetro?';

const find = (pack: PackItem[], code: string) => pack.find((p) => p.documentCode === code);

export const twoSteps: Plan = (pack) => {
  const proc = find(pack, 'PROC-DOOR-001');
  assert.ok(proc, 'процедурата е в пакета');
  const other = pack.find((p) => p.applicable && p.documentCode !== 'PROC-DOOR-001') ?? proc;
  return {
    causes: [{ text: 'Contatto porta di piano', evidenceRefs: [proc.ref] }],
    checks: [
      {
        step: 1,
        action: DIAG,
        expected: 'Il codice è leggibile',
        actionClass: 'DIAGNOSTIC',
        evidenceRefs: [other.ref],
      },
      {
        step: 2,
        action: SAFETY,
        expected: 'Contatto chiuso',
        actionClass: 'SAFETY_RELEVANT',
        evidenceRefs: [proc.ref],
      },
    ],
    evidenceUsed: [cite(proc), ...(other === proc ? [] : [cite(other)])],
  };
};

export interface Extra {
  engineering: User;
  support2: User;
  supportB: User;
  eng: Client;
  sup2: Client;
  supB: Client;
}

export async function extraStaff(h: Harness, w: World): Promise<Extra> {
  const engineering = await makeUser({
    tenantId: w.tenantA.id,
    role: 'ENGINEERING',
    name: 'Enzo Ingegnere',
  });
  const support2 = await makeUser({ tenantId: w.tenantA.id, role: 'SUPPORT', name: 'Sara Due' });
  const supportB = await makeUser({ tenantId: w.tenantB.id, role: 'SUPPORT', name: 'Sara B' });
  return {
    engineering,
    support2,
    supportB,
    eng: await signIn(h, engineering),
    sup2: await signIn(h, support2),
    supB: await signIn(h, supportB),
  };
}

/** Случай на техника с отговор от две стъпки; връща id на случая и на AI съобщението. */
export async function caseWithSteps(
  h: Harness,
  tech: Client,
  deviceSerial = 'SN-ALFA-1',
): Promise<{ caseId: string; messageId: string }> {
  h.model.plan = twoSteps;
  const caseId = await newCase(tech, { deviceSerial });
  const res = await ask(tech, caseId, QUESTION);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const checks = res.body.answer.payload.checks as Array<{ requiresConfirmation: boolean }>;
  assert.equal(checks.length, 2, JSON.stringify(res.body.answer.payload.gate));
  assert.equal(checks[1]?.requiresConfirmation, true);
  return { caseId, messageId: res.body.answer.id as string };
}

export const execute = (
  c: Client,
  caseId: string,
  body: { messageId: string; step: number; result: string; note?: string },
) => c.post(`/api/v1/cases/${caseId}/steps`, body);

export const requestApproval = (
  c: Client,
  caseId: string,
  body: { messageId: string; step: number; note?: string; attest?: boolean },
) => c.post(`/api/v1/cases/${caseId}/steps/approvals`, body);

export const decide = (c: Client, approvalId: string, decision: 'GRANT' | 'DENY', reason: string) =>
  c.post(`/api/v1/approvals/${approvalId}/decide`, { decision, reason });
