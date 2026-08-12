"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR кодът се генерира ИЗЦЯЛО в браузъра (пакет qrcode) — нищо не се праща
// към външни услуги, в духа на „данните остават при теб“.
// Генерирай ВЕДНЪЖ в редактора с useQrDataUrl и подай готовия src на
// клетките — иначе всяка от 24-те клетки на листа смята същия QR наново.

export function useQrDataUrl(text: string, dark: string = "#1B1B1B"): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(text, {
      width: 512,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark, light: "#FFFFFF" },
    })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [text, dark]);

  return url;
}

interface Props {
  /** Готов data: URL от useQrDataUrl. */
  src: string | null;
  style?: React.CSSProperties;
  className?: string;
}

export default function QrImage({ src, style, className }: Props) {
  if (!src) return null;
  // data: URL — next/image няма какво да оптимизира тук.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR код" style={style} className={className} />;
}
