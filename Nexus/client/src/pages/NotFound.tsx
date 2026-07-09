import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="panel" style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, color: 'var(--gold-1)', textShadow: '0 0 24px rgba(214,161,61,.3)' }}>404</div>
      <h2 style={{ marginTop: 8 }}>{t('notFound.title')}</h2>
      <p className="muted" style={{ marginTop: 12 }}>{t('notFound.body')}</p>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <Link to="/app" className="btn btn-primary">{t('notFound.returnHome')}</Link>
        <Link to="/app/quests" className="btn">{t('notFound.findQuest')}</Link>
      </div>
    </div>
  );
}
