'use client';

import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';

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
        <label htmlFor={urlId} className="block text-sm font-semibold text-slate-800">
          {labels.url}
        </label>
        <input
          id={urlId}
          type="text"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="none"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 1000))}
          placeholder={labels.placeholder}
          className="auth-field !mt-1.5"
        />
        <div className="flex flex-wrap items-center gap-5">
          <label htmlFor={colorId} className="flex items-center gap-3 text-sm font-semibold text-slate-800">
            <input
              id={colorId}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
            {labels.color}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            {labels.transparent}
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSvg}
            disabled={!svg}
            className="rounded-full bg-linketto-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-linketto-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.downloadSvg}
          </button>
          <button
            type="button"
            onClick={onPng}
            disabled={!svg}
            className="rounded-full border border-linketto-600 px-5 py-2.5 text-sm font-semibold text-linketto-700 transition hover:bg-linketto-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.downloadPng}
          </button>
        </div>
      </div>
      <figure className="mx-auto w-full max-w-[18rem]">
        <div
          className="flex aspect-square items-center justify-center rounded-2xl border border-slate-200 bg-[conic-gradient(#f1f5f9_25%,#fff_0_50%,#f1f5f9_0_75%,#fff_0)] bg-[length:20px_20px] p-4"
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
            <p className="px-6 text-center text-sm text-slate-500">{labels.empty}</p>
          )}
        </div>
      </figure>
    </div>
  );
}
