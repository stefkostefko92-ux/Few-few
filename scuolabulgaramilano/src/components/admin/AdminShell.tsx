import Link from "next/link";
import LogoutButton from "./LogoutButton";

const NAV = [
  { href: "/admin", key: "dashboard", label: "Dashboard", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="14" width="8" height="7" rx="2" /></svg>) },
  { href: "/admin/content", key: "content", label: "Contenuti", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16M4 12h16M4 19h10" strokeLinecap="round" /></svg>) },
  { href: "/admin/media", key: "media", label: "Media", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" /></svg>) },
  { href: "/admin/leads", key: "leads", label: "Richieste", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v14H4z" /><path d="m4 7 8 6 8-6" strokeLinejoin="round" /></svg>) },
];

export default function AdminShell({
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="admin">
      <aside className="ad-side">
        <div className="ad-brand">
          <img src="/assets/img/brand/logo.webp" alt="" />
          <div><b>Qui Bulgaria</b><small>Admin</small></div>
        </div>
        <nav className="ad-nav">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className={active === n.key ? "active" : ""}>
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ad-side__foot">
          <a href="/" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Vedi il sito
          </a>
          <LogoutButton />
        </div>
      </aside>

      <main className="ad-main">
        <div className="ad-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
