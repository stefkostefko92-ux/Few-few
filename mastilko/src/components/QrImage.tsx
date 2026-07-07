"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  /** Съдържание на QR кода (vCard, URL…). */
  text: string;
  style?: React.CSSProperties;
  className?: string;
}

// QR кодът се генерира ИЗЦЯЛО в браузъра (пакет qrcode) — нищо не се праща
// към външни услуги, в духа на „данните остават при теб“.
export default function QrImage({ text, style, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, {
      width: 512,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#1B1B1B", light: "#FFFFFF" },
    })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [text]);

  if (!url) return null;
  // data: URL — next/image няма какво да оптимизира тук.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="QR код" style={style} className={className} />;
}
