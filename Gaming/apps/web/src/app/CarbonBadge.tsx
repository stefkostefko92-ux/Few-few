import { BRAND } from "@aso/shared";

/**
 * Fixed bottom-right attribution badge linking to Carbon Stealth (§14).
 * Sits above all content but stays unobtrusive; opens in a new tab.
 */
export function CarbonBadge() {
  return (
    <a
      href={BRAND.attributionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-3 right-3 z-50 rounded-full border border-brass-400/25 bg-charcoal-900/70 px-3 py-1.5 text-xs font-medium text-ink-300 backdrop-blur-sm transition-colors duration-fast hover:border-brass-300 hover:text-brass-300"
      title="Carbon Stealth VCC"
    >
      A <span className="font-semibold text-brass-300">Carbon Stealth VCC</span> product
    </a>
  );
}
