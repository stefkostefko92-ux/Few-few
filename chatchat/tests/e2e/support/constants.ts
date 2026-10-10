export const E2E_PORT = Number(process.env.E2E_PORT ?? 4392);
export const E2E_READY_PORT = E2E_PORT + 1;
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
/** Кодът, който „моделът“ чете от снимката във фикстурата. */
export const PHOTO_CODE = 'E37';
/**
 * Единният вход (OIDC): отделен екземпляр на приложението с включен SSO и фалшив доставчик на
 * `localhost` — друг сайт от 127.0.0.1, т.е. истинско връщане от чужд сайт (SameSite бисквитките).
 */
export const E2E_SSO_PORT = E2E_PORT + 2;
export const E2E_SSO_ORIGIN = `http://127.0.0.1:${E2E_SSO_PORT}`;
export const E2E_IDP_PORT = E2E_PORT + 3;
export const E2E_IDP_ORIGIN = `http://localhost:${E2E_IDP_PORT}`;
