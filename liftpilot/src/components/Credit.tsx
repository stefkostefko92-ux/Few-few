// The owner's permanent signature on every page, without exception: the one English line of the interface (lang="en"),
// linked to Carbon Stealth in a new tab. No hooks and no server API: the footers, the error pages and the plain pages
// outside the language segment (the root 404, the global error page) all draw this one.
export default function Credit({ className = 'footer-credit' }: { className?: string }) {
  return (
    <span className={className} lang="en">
      Created and Designed by{' '}
      <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>
    </span>
  );
}
