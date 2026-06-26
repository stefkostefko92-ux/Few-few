import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound(): React.ReactElement {
  return (
    <div className="panel" style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, color: 'var(--gold-1)', textShadow: '0 0 24px rgba(214,161,61,.3)' }}>404</div>
      <h2 style={{ marginTop: 8 }}>This road leads nowhere.</h2>
      <p className="muted" style={{ marginTop: 12 }}>The path you seek does not exist in this realm. Perhaps the map is wrong, or perhaps the page never was.</p>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <Link to="/app" className="btn btn-primary">Return Home</Link>
        <Link to="/app/quests" className="btn">Find a Quest</Link>
      </div>
    </div>
  );
}
