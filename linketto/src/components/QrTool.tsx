'use client';

import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';

// Безплатен QR генератор — изцяло в браузъра: нищо не се праща към сървър,
// няма регистрация, няма воден знак. SVG (за печат) и PNG (за соцмрежи).

export function QrTool({
  labels,
}: {
  labels: {
    url: string;
    placeholder: string;
    color: string;
    transparent: string;
    downloadSvg: string;
    downloadPng: string;
    empty: string;
    preview: string;
  };
}) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#1d3d5c');
  const [transparent, setTransparent] = useState(false);
  const [svg, setSvg] = useState('');
  const urlId = useId();
  const colorId = useId();

  const value = text.trim();
  const light = transparent ? '#ffffff00' : '#ffffffff';

  useEffect(() => {
    if (!value) {
      setSvg('');
      return;
    }
    let alive = true;
    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: color, light },
    })
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value, color, light]);

  function download(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  }

  async function onPng() {
    const url = await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 1024,
      color: { dark: color, light },
    });
    download(url, 'qr-linketto.png');
  }

  function onSvg() {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    download(url, 'qr-linketto.svg');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_minmax(0,18rem)] md:items-start">
      <div className="space-y-5">
        <div className="space-y-1.5">
        <Label htmlFor={urlId}>{labels.url}</Label>
        <Input
          id={urlId}
          type="text"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="none"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 1000))}
          placeholder={labels.placeholder}
        />
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label htmlFor={colorId} className="flex items-center gap-3 text-small font-semibold text-fg">
            <input
              id={colorId}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="focus-ring h-10 w-14 cursor-pointer rounded-control border border-line-input bg-surface p-1"
            />
            {labels.color}
          </label>
          <label className="flex items-center gap-2 text-small font-medium text-fg-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            {labels.transparent}
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onSvg} disabled={!svg}>
            {labels.downloadSvg}
          </Button>
          <Button variant="secondary" onClick={onPng} disabled={!svg}>
            {labels.downloadPng}
          </Button>
        </div>
      </div>
      <figure className="mx-auto w-full max-w-[18rem]">
        <div
          // Шахматът (прозрачност) — само при прозрачен фон и готов код; иначе спокойна повърхност.
          className={`flex aspect-square items-center justify-center rounded-panel border border-line p-4 ${
            svg && transparent
              ? 'bg-[conic-gradient(#e8ecf1_25%,#fff_0_50%,#e8ecf1_0_75%,#fff_0)] bg-[length:20px_20px]'
              : svg
                ? 'bg-white'
                : 'bg-surface-2'
          }`}
          role="img"
          aria-label={svg ? labels.preview : labels.empty}
        >
          {svg ? (
            // Изходът е SVG от библиотеката qrcode (входът е кодиран в модули,
            // не се вмъква като markup).
            <div
              className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="rounded-control bg-surface/90 px-4 py-3 text-center text-small text-fg-2">{labels.empty}</p>
          )}
        </div>
      </figure>
    </div>
  );
}
