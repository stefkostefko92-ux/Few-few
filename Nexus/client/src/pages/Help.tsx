import React from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';

export default function Help(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('help.title')}</h2>
          <div className="panel-subtitle">{t('help.subtitle')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Текстове с вложени линкове/маркиране → <Trans> с именувани компоненти. */}
          <Step n={1} title={t('help.step1Title')}>
            <Trans i18nKey="help.step1Body" components={{ questsLink: <Link to="/app/quests" /> }} />
          </Step>
          <Step n={2} title={t('help.step2Title')}>
            {t('help.step2Body')}
          </Step>
          <Step n={3} title={t('help.step3Title')}>
            <Trans i18nKey="help.step3Body" components={{ b: <strong />, charLink: <Link to="/app/character" /> }} />
          </Step>
          <Step n={4} title={t('help.step4Title')}>
            <Trans i18nKey="help.step4Body" components={{ shopLink: <Link to="/app/shop" /> }} />
          </Step>
          <Step n={5} title={t('help.step5Title')}>
            <Trans i18nKey="help.step5Body" components={{ arenaLink: <Link to="/app/arena" /> }} />
          </Step>
          <Step n={6} title={t('help.step6Title')}>
            <Trans i18nKey="help.step6Body" components={{ b: <strong />, charLink: <Link to="/app/character" /> }} />
          </Step>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('help.classesTitle')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <ClassRow name={t('charCreate.classes.warrior.name')} desc={t('help.classWarriorDesc')} />
          <ClassRow name={t('charCreate.classes.ranger.name')} desc={t('help.classRangerDesc')} />
          <ClassRow name={t('charCreate.classes.mage.name')} desc={t('help.classMageDesc')} />
          <ClassRow name={t('charCreate.classes.rogue.name')} desc={t('help.classRogueDesc')} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('help.mechanicsTitle')}</h2>
        </div>
        <ul style={{ lineHeight: 1.8 }}>
          <li><Trans i18nKey="help.mechInitiative" components={{ b: <strong /> }} /></li>
          <li><Trans i18nKey="help.mechDamage" components={{ b: <strong />, i: <em /> }} /></li>
          <li><Trans i18nKey="help.mechCrit" components={{ b: <strong /> }} /></li>
          <li><Trans i18nKey="help.mechDefense" components={{ b: <strong />, code: <code /> }} /></li>
          <li><Trans i18nKey="help.mechDodge" components={{ b: <strong /> }} /></li>
          <li><Trans i18nKey="help.mechBlock" components={{ b: <strong /> }} /></li>
          <li><Trans i18nKey="help.mechLoss" components={{ b: <strong /> }} /></li>
        </ul>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('help.tipsTitle')}</h2>
        </div>
        <ul style={{ lineHeight: 1.8 }}>
          <li>{t('help.tipEquip')}</li>
          <li>{t('help.tipPotions')}</li>
          <li>{t('help.tipHp')}</li>
          <li>{t('help.tipRest')}</li>
          <li><Trans i18nKey="help.tipMap" components={{ worldLink: <Link to="/app/world" /> }} /></li>
          <li><Trans i18nKey="help.tipHistory" components={{ historyLink: <Link to="/app/history" /> }} /></li>
        </ul>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ position: 'relative', paddingLeft: 48 }}>
      <div style={{
        position: 'absolute',
        left: 14,
        top: 14,
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: 'linear-gradient(180deg, var(--gold-2), var(--gold-3))',
        color: '#181307',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
      }}>{n}</div>
      <strong style={{ color: 'var(--gold-1)' }}>{title}</strong>
      <div className="muted text-sm" style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ClassRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="card">
      <strong style={{ color: 'var(--gold-1)' }}>{name}</strong>
      <div className="muted text-sm" style={{ marginTop: 4 }}>{desc}</div>
    </div>
  );
}
