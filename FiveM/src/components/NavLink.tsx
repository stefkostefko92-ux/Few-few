'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Връзка в навигацията, която знае дали е текущата страница.
 *
 * `aria-current="page"` не е дреболия: без него екранният четец обявява седем
 * еднакви връзки без нито един признак къде се намираш, а цветът сам по себе
 * си не е информация (WCAG 1.4.1). Затова текущата носи И различен цвят, И
 * долна черта, И `aria-current`.
 *
 * Клиентска е само заради `usePathname`; съдържанието (иконата, която се чете
 * от диска) идва като `children` и се рендира на сървъра.
 */
export function NavLink({
  href,
  exact = false,
  className = '',
  activeClassName = '',
  children,
}: {
  href: string;
  /**
   * Началната страница (`/bg`) е представка на ВСИЧКО останало — без точно
   * сравнение тя щеше да свети като активна на всяка страница от сайта.
   */
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${className} ${active ? activeClassName : ''}`.trim()}
    >
      {children}
    </Link>
  );
}
