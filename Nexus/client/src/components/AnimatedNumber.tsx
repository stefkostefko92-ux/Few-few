import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Smoothly tweens between successive `value` props. Used for HP / Gold /
 * Energy / XP pills so changes feel alive instead of teleporting.
 */
export default function AnimatedNumber({
  value,
  duration = 600,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: Props): React.ReactElement {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const flashed = useRef(false);

  useEffect(() => {
    if (value === toRef.current) return;
    fromRef.current = display;
    toRef.current = value;
    startRef.current = null;
    flashed.current = false;

    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const v = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setDisplay(toRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  // Trigger flash animation on change
  const flashKey = `${Math.round(value)}`;

  return (
    <span key={flashKey} className={`num-flash ${className || ''}`}>
      {format(display)}
    </span>
  );
}
