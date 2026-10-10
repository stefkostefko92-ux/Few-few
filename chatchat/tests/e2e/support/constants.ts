export const E2E_PORT = Number(process.env.E2E_PORT ?? 4392);
export const E2E_READY_PORT = E2E_PORT + 1;
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
/** Фалшивият helpdesk (общ webhook/Zendesk/JSM) на e2e сървъра — интеграцията (FR-09). */
export const E2E_HELPDESK_PORT = E2E_PORT + 2;
export const E2E_HELPDESK = `http://127.0.0.1:${E2E_HELPDESK_PORT}`;
/** Кодът, който „моделът“ чете от снимката във фикстурата. */
export const PHOTO_CODE = 'E37';
