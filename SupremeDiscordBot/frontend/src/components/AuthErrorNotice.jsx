// frontend/src/components/AuthErrorNotice.jsx
// The box above the sign-in button when /api/auth/callback sends the visitor
// back with `?error=<code>`. Every code the backend emits (routes/auth.js) has
// its own message that says what happened and what to do next — a single
// "authentication failed" for everything hid whether the visitor should simply
// sign in again (expired or reused link) or whether our setup is broken.

// Plain statements of what happened. No "verify", "expired account" or
// "log in again to continue" pressure — that is the vocabulary of phishing
// lures, and this box sits right next to a sign-in button.
export const AUTH_ERROR_MESSAGES = Object.freeze({
  blacklisted: "You have been blacklisted from this platform.",
  oauth_denied: "Sign-in was cancelled on Discord, so nothing was shared with Supreme Bot.",
  oauth_expired: "This Discord sign-in link was already used or is too old. You can start sign-in again from this page.",
  oauth_failed: "Discord sign-in did not complete on our side. Please try again in a few minutes.",
  no_code: "Discord returned without a sign-in code, so nothing changed.",
  session_failed: "Your session could not be started. Please try again.",
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
