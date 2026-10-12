// Отражение на матрицата на ролите (src/auth/rbac.ts) САМО за да скрива бутони, които сървърът
// така или иначе би отказал. Сигурността е на сървъра — тук грешка води най-много до излишен бутон
// или до ясен отказ от API-то, никога до достъп.

import { state } from '../store.js';

const TECH = [
  'case:create',
  'chat:ask',
  'ticket:create',
  'feedback:create',
  'conversation:use',
  'step:record',
];
const STAFF_CHAT = ['conversation:create', 'channel:create'];
const OPERATOR = ['case:readAll', 'case:assign', 'device:readAll', 'step:approve'];
const CAPS = {
  PORTAL_TECHNICIAN: TECH,
  INTERNAL_TECHNICIAN: [...TECH, 'device:readAll', 'conversation:create'],
  SUPPORT: [...TECH, ...OPERATOR, ...STAFF_CHAT],
  ENGINEERING: [...TECH, ...OPERATOR, ...STAFF_CHAT],
  KNOWLEDGE_OWNER: [
    ...TECH,
    'case:readAll',
    'case:assign',
    'device:readAll',
    'kb:manage',
    ...STAFF_CHAT,
  ],
  TENANT_ADMIN: [
    'case:readAll',
    'device:readAll',
    'users:manage',
    'conversation:use',
    'policy:manage',
    ...STAFF_CHAT,
  ],
  PLATFORM_ADMIN: ['users:manage'],
};

export const can = (cap) => (CAPS[state.user?.role] ?? []).includes(cap);
export const isPortal = () => state.user?.kind === 'PORTAL';
