// Контакт форма — POST към /api/contact.php по договора от site.json.
// Полета: name, email, phone, message, lang, _gotcha (honeypot).
import { useState } from 'react';
import { useContent } from '@/lib/content-context';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function ContactForm(): React.JSX.Element {
  const { content, lang, site } = useContent();
  const ui = content.ui;
  const [status, setStatus] = useState<Status>('idle');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set('lang', lang);
    setStatus('sending');
    try {
      const res = await fetch(site.contactApi.endpoint, {
        method: site.contactApi.method,
        body: data,
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
      form.reset();
    } catch {
      // При статичен хостинг endpoint-ът може да липсва — показваме грешка, но
      // не чупим страницата.
      setStatus('error');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(245,245,240,.03)',
    border: '1px solid rgba(245,245,240,.1)',
    color: 'var(--off-white)',
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
  };

  if (status === 'sent') {
    return (
      <div
        style={{
          border: '1px solid rgba(0,255,136,.3)',
          padding: 32,
          color: 'var(--green)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {content.misc.form_sent_title ?? 'OK'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>{ui.form_sent}</div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      <div className="cs-form-row" style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label htmlFor="cs-f-name" className="sr-only">{ui.form_name}</label>
          <input id="cs-f-name" name="name" required placeholder={ui.form_name} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="cs-f-email" className="sr-only">{ui.form_email}</label>
          <input id="cs-f-email" name="email" type="email" required placeholder={ui.form_email} style={inputStyle} />
        </div>
      </div>
      <label htmlFor="cs-f-phone" className="sr-only">{ui.form_phone}</label>
      <input id="cs-f-phone" name="phone" placeholder={ui.form_phone} style={inputStyle} />
      <label htmlFor="cs-f-msg" className="sr-only">{ui.form_msg}</label>
      <textarea id="cs-f-msg" name="message" required rows={5} placeholder={ui.form_msg} style={inputStyle} />
      {/* Honeypot — скрит от хора, залавя ботове */}
      <input
        name="_gotcha"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden
      />
      <p style={{ fontSize: 10, color: 'var(--placeholder)' }}>
        {ui.form_gdpr}{' '}
        <a href={lang === 'it' ? '/privacy/' : `/${lang}/privacy/`} style={{ color: 'var(--cyan)' }}>
          {content.misc.privacy_link_label ?? 'Privacy'}
        </a>
      </p>
      <button
        type="submit"
        disabled={status === 'sending'}
        data-cursor
        style={{
          padding: '16px 24px',
          background: 'var(--cyan)',
          color: '#000',
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          fontSize: 12,
          cursor: 'pointer',
          border: '1px solid var(--cyan)',
        }}
      >
        {status === 'sending' ? content.misc.form_sending ?? '...' : ui.form_send}
      </button>
      {status === 'error' && (
        <p style={{ fontSize: 11, color: 'var(--red)' }} role="alert">
          {ui.form_error ?? 'Error'} <a href={`mailto:${site.email}`} style={{ color: 'var(--cyan)' }}>{site.email}</a>
        </p>
      )}
    </form>
  );
}
