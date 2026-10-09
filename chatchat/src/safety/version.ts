/**
 * Версията на правилата на Safety Gate (AC-09): влиза във всеки AI отговор — и в този без модел
 * (`noEvidenceAnswer`). Промяна на правилата или праговете → нова версия и прогон на `evals/`.
 * .3: праговете на §8.3 с семантично търсене (retrieve.ts: SEMANTIC_*_SIMILARITY, RRF).
 */
export const GATE_VERSION = 'gate-2026-10-09.3';
