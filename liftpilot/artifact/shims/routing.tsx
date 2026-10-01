// The app's localized routing in the standalone page: there is one page, so links are plain anchors and navigation
// does nothing (the records are not saved here).
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; locale?: string; children?: ReactNode }) {
  return <a href={href} {...rest}>{children}</a>;
}

export function useRouter(): { push(href: string): void; replace(href: string): void; refresh(): void } {
  return { push: () => undefined, replace: () => undefined, refresh: () => undefined };
}

export const usePathname = (): string => '/';
