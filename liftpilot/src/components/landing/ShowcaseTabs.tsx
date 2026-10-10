'use client';

// The product showcase's tabs (WAI-ARIA tabs, automatic activation): one tab per step of the way from the survey to the
// documents, its panel the template's product frame with what the software made for the sample installation. The
// panels are rendered on the server; without JavaScript the first one shows. Arrow keys, Home and End move between tabs.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/Icon';

export interface ShowcaseTab {
  id: string;
  label: string;
  icon: IconName;
}

interface Props {
  tabs: readonly ShowcaseTab[];
  /** the tab list's name */
  label: string;
  /** the section's heading and text, over the tabs */
  intro: ReactNode;
  /** one per tab, in the same order */
  panels: readonly ReactNode[];
}

export default function ShowcaseTabs({ tabs, label, intro, panels }: Props) {
  const [at, setAt] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const go = (n: number): void => {
    const k = (n + tabs.length) % tabs.length;
    setAt(k);
    refs.current[k]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const move: Record<string, number> = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 };
    const to = move[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };

  return (
    <div className="showcase">
      <div className="showcase-copy">
        {intro}
        <div className="showcase-tabs" role="tablist" aria-label={label} aria-orientation="vertical" onKeyDown={onKey}>
          {tabs.map((tab, k) => (
            <button key={tab.id} ref={(el) => { refs.current[k] = el; }} type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
              aria-selected={k === at} tabIndex={k === at ? 0 : -1} className="showcase-tab" onClick={() => setAt(k)}>
              <Icon name={tab.icon} size={18} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="showcase-stage">
        {panels.map((p, k) => (
          <div key={tabs[k]?.id ?? k} role="tabpanel" id={`panel-${tabs[k]?.id}`} aria-labelledby={`tab-${tabs[k]?.id}`} tabIndex={0} hidden={k !== at}>
            {p}
          </div>
        ))}
      </div>
    </div>
  );
}
