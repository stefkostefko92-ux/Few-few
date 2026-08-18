// frontend/src/components/EmptyState.jsx
// Shared "nothing here yet" state: icon + title + description + optional CTA.
// Drop-in replacement for the ad-hoc "No X found" text scattered across the
// list pages — gives every empty list a next action instead of a dead end.
import { Link } from "react-router-dom";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaTo,       // internal route (react-router Link)
  ctaHref,     // external link (new tab)
  onCtaClick,  // in-page action (open a create form, clear filters, …)
  className = "",
}) {
  const ctaClass = "cs-btn-secondary text-xs mt-1";

  return (
    <div className={`cs-card text-center py-12 px-6 ${className}`}>
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-cs-panel flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-cs-dim" aria-hidden="true" />
        </div>
      )}
      {title && <p className="text-cs-text font-semibold mb-1">{title}</p>}
      {description && (
        <p className="text-cs-muted text-sm max-w-sm mx-auto mb-5">{description}</p>
      )}
      {ctaLabel && ctaTo && (
        <Link to={ctaTo} className={ctaClass}>{ctaLabel}</Link>
      )}
      {ctaLabel && ctaHref && (
        <a href={ctaHref} target="_blank" rel="noopener noreferrer" className={ctaClass}>{ctaLabel}</a>
      )}
      {ctaLabel && onCtaClick && (
        <button type="button" onClick={onCtaClick} className={ctaClass}>{ctaLabel}</button>
      )}
    </div>
  );
}
