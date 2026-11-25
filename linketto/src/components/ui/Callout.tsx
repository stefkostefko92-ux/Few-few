import { cn } from '@/components/ui/cn';
import {
  AlertGlyph,
  CheckCircleGlyph,
  InfoGlyph,
  XCircleGlyph,
} from '@/components/ui/glyphs';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<CalloutTone, { box: string; icon: string; Icon: typeof InfoGlyph }> = {
  info: {
    box: 'border-accent/30 bg-accent-soft text-accent-soft-fg',
    icon: 'text-accent-text',
    Icon: InfoGlyph,
  },
  success: {
    box: 'border-success/30 bg-success-soft text-success-text',
    icon: 'text-success-text',
    Icon: CheckCircleGlyph,
  },
  warning: {
    box: 'border-warning/35 bg-warning-soft text-warning-text',
    icon: 'text-warning-text',
    Icon: AlertGlyph,
  },
  danger: {
    box: 'border-danger/35 bg-danger-soft text-danger-text',
    icon: 'text-danger-text',
    Icon: XCircleGlyph,
  },
};

// Съобщения в потока. Опасност/предупреждение → role="alert"; останалите —
// role="status". Цветът никога не е единственият носител (има икона и текст).
export function Callout({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-card border px-4 py-3 text-small', box, className)}
    >
      <Icon className={cn('mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0', icon)} />
      <div className="min-w-0 space-y-0.5 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
