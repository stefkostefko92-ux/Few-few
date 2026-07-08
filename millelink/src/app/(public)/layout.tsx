import '../globals.css';

// Root layout за публичните профили (/u/...). Езикът на конкретния профил
// се решава чак в страницата (профилен език + ?hl + Accept-Language),
// затова тук lang е неутрално "en", а страницата слага lang/dir на <main>.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
