"use client";

// Малък контрол, който нулира запомненото известие за бисквитки и го показва
// отново (право на лесна промяна на решението — добра практика по GDPR/ePrivacy).
const KEY = "mbd_cookie_consent_v1";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* игнорираме */
        }
        location.reload();
      }}
      className={className}
    >
      Настройки за бисквитки
    </button>
  );
}
