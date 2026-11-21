import Image from 'next/image';
import { cn } from '@/components/ui/cn';

// Едно лого навсякъде (решение на собственика): същото като на лендинга —
// public/logo.png. next/image го сервира като малък webp в нужния размер.
// В тъмна тема става бяло (.brand-logo в globals.css), в светла остава синьо.
export function Logo({
  name,
  className,
  priority,
}: {
  name: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt={name}
      width={132}
      height={50}
      priority={priority}
      className={cn('brand-logo h-8 w-auto', className)}
    />
  );
}
