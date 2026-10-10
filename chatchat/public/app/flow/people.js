// Как се показва човек в потока: „Lei“ за себе си, иначе името — а порталът получава от сървъра
// само ролята на служителя (name: null), затова тогава — етикетът на ролята.

import { roleLabel } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';

export const personText = (p) =>
  !p ? '' : p.id === state.user?.id ? t('case.assignedToYou') : (p.name ?? roleLabel(p.role));

/** Стъпката, чието състояние получава фокуса след опресняване (бутонът, с който е действано, изчезва). */
export const stepFocus = { key: null };
