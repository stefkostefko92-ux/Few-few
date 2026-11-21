import Link from 'next/link';
import { cn } from '@/components/ui/cn';

export interface SidebarItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Малък брояч/бадж отдясно */
  badge?: React.ReactNode;
  /** Текущата страница (страницата си знае сама; няма usePathname тук);
   *  'location' = текущият раздел в същата страница (котва) */
  current?: boolean | 'page' | 'location';
}

export interface SidebarGroup {
  /** Заглавие на групата (по желание) */
  label?: string;
  items: readonly SidebarItem[];
}

/**
 * Страничното меню на приложението (табло — фаза 2, админ — фаза 3).
 * Сървърен компонент: чисти <a>; текущият елемент е aria-current="page".
 *
 *   <Sidebar ariaLabel="Табло" brand={<Logo name="Linketto" />}
 *            groups={[{ items: [{ href, label, icon, current }] }]}
 *            footer={<ThemeToggle … />} />
 */
export function Sidebar({
  ariaLabel,
  brand,
  groups,
  footer,
  className,
}: {
  ariaLabel: string;
  brand?: React.ReactNode;
  groups: readonly SidebarGroup[];
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full flex-col gap-5 px-3 py-4', className)}>
      {brand && <div className="px-2">{brand}</div>}
      <nav aria-label={ariaLabel} className="flex-1 space-y-5 overflow-y-auto">
        {groups.map((group, index) => (
          <div key={group.label ?? index}>
            {group.label && (
              <p className="px-2 pb-1.5 text-micro font-semibold text-fg-muted">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.current ? (item.current === true ? 'page' : item.current) : undefined}
                    className={cn(
                      'focus-ring group flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-body font-medium transition-colors',
                      item.current
                        ? 'bg-accent-soft text-accent-soft-fg'
                        : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    {item.icon && (
                      <span aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full">
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="border-t border-line px-2 pt-4">{footer}</div>}
    </div>
  );
}
