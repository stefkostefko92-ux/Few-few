import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * GDPR-compliant cookie banner. We use exactly one essential session
 * cookie (the JWT for auth); analytics are off by default. The banner
 * exists so EU/IT/BG visitors see the disclosure on first visit, and
 * remembers their choice afterwards.
 */
export default function CookieBanner(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem('nd_cookie_consent');
      if (!seen) setVisible(true);
    } catch { /* private mode etc. */ }
  }, []);

  function decide(choice: 'accept' | 'reject') {
    try { localStorage.setItem('nd_cookie_consent', choice + ':' + Date.now()); } catch {}
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie preferences">
      <div className="cookie-banner-text">
        <strong>One cookie, no tracking.</strong> Nexus Dominion uses a single essential
        session cookie to keep you logged in. We don't run analytics, ad-tech, or third-party
        trackers. Read more in our <Link to="/privacy">Privacy Policy</Link>.
      </div>
      <div className="cookie-banner-actions">
        <button className="btn btn-sm" onClick={() => decide('reject')}>Reject optional</button>
        <button className="btn btn-sm btn-primary" onClick={() => decide('accept')}>OK, got it</button>
      </div>
    </div>
  );
}
