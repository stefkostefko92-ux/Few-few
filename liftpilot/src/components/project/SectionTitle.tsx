import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/Icon';

/** A work page's section heading after the template's panel heads: the painted icon in its bordered tile, then the
 *  title. The icon is decorative (the heading's text names the section); `tone` tints the tile (`warn` for what is
 *  missing, `ok`, `fail`); `eyebrow` puts the template's small mono line over the title — only for a fact the section
 *  is about (a date, a standard), read as part of the heading. */
export default function SectionTitle({ icon, children, id, level = 2, tone, className, eyebrow }: {
  icon: IconName; children: ReactNode; id?: string; level?: 2 | 3; tone?: 'ok' | 'warn' | 'fail'; className?: string; eyebrow?: ReactNode;
}) {
  const H = level === 3 ? 'h3' : 'h2';
  return (
    <H id={id} className={className ? `sec-title ${className}` : 'sec-title'}>
      <span className={tone ? `icon-tile sm ${tone}` : 'icon-tile sm'}><Icon name={icon} size={20} /></span>
      {eyebrow ? (
        <span className="sec-text stack"><span className="eyebrow">{eyebrow}</span><span>{children}</span></span>
      ) : <span className="sec-text">{children}</span>}
    </H>
  );
}
