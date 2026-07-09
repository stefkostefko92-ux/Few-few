import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Avatar from '../components/Avatar';

interface AvatarOpt {
  slug: string;
  name: string;
  class?: string;
  unlocked: boolean;
  unlocked_by?: string;
}
interface FrameOpt {
  slug: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  border: string;
  glow: string;
  pattern: string;
  unlocked: boolean;
  unlocked_by?: string;
}

export default function Profile(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refreshChar = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [avatars, setAvatars] = useState<AvatarOpt[]>([]);
  const [frames, setFrames] = useState<FrameOpt[]>([]);
  const [bio, setBio] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  async function load() {
    try {
      const r = await api.get('/profile/me');
      setProfile(r);
      setAvatars(r.available_avatars);
      setFrames(r.available_frames);
      setBio(r.bio || '');
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function setAvatar(slug: string) {
    try {
      await api.post('/profile/cosmetics', { avatar: slug });
      toast(t('profile.avatarUpdated'), 'success');
      await Promise.all([load(), refreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function setFrame(slug: string) {
    try {
      await api.post('/profile/cosmetics', { frame: slug });
      toast(t('profile.frameUpdated'), 'success');
      await Promise.all([load(), refreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function saveBio() {
    try {
      await api.post('/profile/cosmetics', { bio });
      toast(t('profile.bioSaved'), 'success');
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function rename() {
    try {
      const r = await api.post('/profile/rename', { name: newName });
      toast(t('profile.renamed', { name: r.name }), 'success');
      setRenameOpen(false);
      setNewName('');
      await Promise.all([load(), refreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  if (!profile || !char) return <div className="muted">{t('common.loading')}</div>;

  const ownedFrames = frames.filter((f) => f.unlocked);
  const lockedFrames = frames.filter((f) => !f.unlocked);
  const ownedAvatars = avatars.filter((a) => a.unlocked);
  const lockedAvatars = avatars.filter((a) => !a.unlocked);

  const sinceRename = Date.now() - profile.last_rename_at;
  const cooldownLeft = Math.max(0, profile.rename_cooldown_ms - sinceRename);
  const canRename = cooldownLeft === 0;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('profile.title')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 24, alignItems: 'flex-start' }}>
          <Avatar avatar={profile.avatar} frame={profile.frame_slug} size={132} />
          <div>
            <div className="flex" style={{ alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ color: 'var(--gold-1)' }}>{char.name}</h1>
              {profile.current_title && <span className="tag amethyst">"{profile.current_title}"</span>}
              <button className="btn btn-sm" onClick={() => setRenameOpen(true)} disabled={!canRename}>
                {t('profile.renameButton', { cost: profile.rename_cost })}
              </button>
            </div>
            <div className="muted" style={{ textTransform: 'capitalize' }}>{t(`common.class.${char.class}`, { defaultValue: char.class })} · {t('common.lv')} {char.level}</div>
            {!canRename && (
              <div className="muted text-sm" style={{ marginTop: 4 }}>
                {t('profile.nextRenameIn', { hours: Math.ceil(cooldownLeft / 3_600_000) })}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <label className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('profile.bioLabel')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t('profile.bioPlaceholder')}
                style={{ width: '100%', marginTop: 6 }}
              />
              <div className="flex between" style={{ marginTop: 6 }}>
                <span className="muted text-sm">{bio.length}/500</span>
                <button className="btn btn-sm btn-primary" onClick={saveBio} disabled={bio === profile.bio}>{t('profile.saveBio')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {renameOpen && (
        <>
          <div className="admin-overlay" onClick={() => setRenameOpen(false)} />
          <div className="admin-editor" style={{ width: 400 }}>
            <h3>{t('profile.renameTitle')}</h3>
            <p className="muted">{t('profile.renameDesc', { cost: profile.rename_cost })}</p>
            <div className="field" style={{ marginTop: 12 }}>
              <label>{t('profile.newName')}</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('profile.newNamePlaceholder')}
                pattern="[a-zA-Z][a-zA-Z0-9_]*"
                minLength={3}
                maxLength={20}
                style={{ width: '100%' }}
              />
              <div className="muted text-sm">{t('profile.nameHint')}</div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setRenameOpen(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={newName.length < 3 || (char.gold < profile.rename_cost)} onClick={rename}>
                {t('profile.confirmRename', { cost: profile.rename_cost })}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('profile.avatars')} <span className="muted" style={{ fontSize: 14 }}>({ownedAvatars.length}/{avatars.length})</span></h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
          {[...ownedAvatars, ...lockedAvatars].map((a) => (
            <div
              key={a.slug}
              className="card"
              style={{
                textAlign: 'center',
                cursor: a.unlocked ? 'pointer' : 'default',
                opacity: a.unlocked ? 1 : 0.45,
                borderColor: profile.avatar === a.slug ? 'var(--gold-2)' : undefined,
                boxShadow: profile.avatar === a.slug ? '0 0 22px rgba(214,161,61,.32)' : undefined,
              }}
              onClick={() => a.unlocked && setAvatar(a.slug)}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Avatar avatar={a.slug} frame={profile.frame_slug} size={72} />
              </div>
              <strong style={{ fontSize: 13 }}>{a.name}</strong>
              <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>{a.class ? t(`common.class.${a.class}`, { defaultValue: a.class }) : ''}</div>
              {!a.unlocked && a.unlocked_by !== 'default' && (
                <div className="text-sm" style={{ color: 'var(--text-4)', marginTop: 4 }}>🔒 {a.unlocked_by}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('profile.frames')} <span className="muted" style={{ fontSize: 14 }}>({ownedFrames.length}/{frames.length})</span></h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
          {[...ownedFrames, ...lockedFrames].map((f) => (
            <div
              key={f.slug}
              className="card"
              style={{
                textAlign: 'center',
                cursor: f.unlocked ? 'pointer' : 'default',
                opacity: f.unlocked ? 1 : 0.45,
                borderColor: profile.frame_slug === f.slug ? 'var(--gold-2)' : undefined,
                boxShadow: profile.frame_slug === f.slug ? '0 0 22px rgba(214,161,61,.32)' : undefined,
              }}
              onClick={() => f.unlocked && setFrame(f.slug)}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Avatar avatar={profile.avatar} frame={f.slug} size={72} />
              </div>
              <strong style={{ fontSize: 13 }} className={`rarity-${f.rarity}`}>{f.name}</strong>
              <div className={`rarity-pill ${f.rarity}`} style={{ marginTop: 4 }}>{t(`common.rarity.${f.rarity}`, { defaultValue: f.rarity })}</div>
              {!f.unlocked && f.unlocked_by !== 'default' && (
                <div className="text-sm" style={{ color: 'var(--text-4)', marginTop: 4 }}>🔒 {f.unlocked_by}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
