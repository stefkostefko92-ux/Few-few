// frontend/src/components/AuthErrorNotice.jsx
// The box above the sign-in button when /api/auth/callback sends the visitor
// back with `?error=<code>`. Every code the backend emits (routes/auth.js) has
// its own message that says what happened and what to do next — a single
// "authentication failed" for everything hid whether the visitor should simply
// sign in again (expired or reused link) or whether our setup is broken.

export const AUTH_ERROR_MESSAGES = Object.freeze({
  blacklisted: "You have been blacklisted from this platform.",
  oauth_denied: "Sign-in was cancelled on Discord, so nothing was shared. Sign in again whenever you are ready.",
  oauth_expired: "This sign-in link has expired or was already used. Sign in again to get a fresh one.",
  oauth_failed: "Discord sign-in did not complete on our side. Please try again in a few minutes.",
  no_code: "Discord did not send a sign-in code. Please sign in again.",
  session_failed: "Your session could not be started. Please sign in again.",
});

const FALLBACK_MESSAGE = "Sign-in did not complete. Please try again.";

export function authErrorMessage(code) {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

export default function AuthErrorNotice({ code }) {
  if (!code) return null;
  return (
    <div role="alert" className="mb-6 max-w-md mx-auto lg:mx-0 border border-danger/40 bg-danger/5 px-4 py-3 text-left">
      <div className="font-mono text-[10px] uppercase tracking-wider text-danger mb-1">✕ Auth Error</div>
      <div className="text-sm text-cs-text">{authErrorMessage(code)}</div>
    </div>
  );
}
