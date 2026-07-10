// Typewriter/Scramble декодиране при hover (charset глич, ~22ms стъпка).
import { useEffect, useRef, useState } from 'react';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&<>{}|/\\';

interface Props {
  text: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  /** декодирай веднага при монтиране (иначе — при hover) */
  autoOnMount?: boolean;
}

export default function ScrambleText({
  text,
  as = 'span',
  className,
  style,
  autoOnMount = false,
}: Props): React.JSX.Element {
  const [display, setDisplay] = useState(text);
  const frame = useRef(0);
  const raf = useRef(0);

  const run = (): void => {
    cancelAnimationFrame(raf.current);
    frame.current = 0;
    const total = text.length;
    const tick = (): void => {
      const progress = frame.current / 2; // ~22ms стъпка при 60fps е бързо; забавяме
      let out = '';
      for (let i = 0; i < total; i++) {
        if (i < progress) out += text[i];
        else if (text[i] === ' ') out += ' ';
        else out += CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }
      setDisplay(out);
      frame.current++;
      if (progress < total) raf.current = requestAnimationFrame(tick);
      else setDisplay(text);
    };
    tick();
  };

  useEffect(() => {
    if (autoOnMount) run();
    return () => cancelAnimationFrame(raf.current);
    // еднократно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Tag = as as 'span';
  return (
    <Tag className={className} style={style} onPointerEnter={run}>
      {display}
    </Tag>
  );
}
