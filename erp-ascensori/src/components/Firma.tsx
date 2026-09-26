"use client";

// Платно за подпис на място — работи с пръст, писалка и мишка.
//
// Pointer Events, не Touch/Mouse поотделно: техникът е на обекта с телефон или
// таблет, а понякога с лаптоп. Едно събитие покрива и трите, и `setPointerCapture`
// държи щриха, дори пръстът да излезе извън платното.

import { useEffect, useRef, useState } from "react";
import { IcoChiudi } from "@/components/icone";

export default function Firma({
  onCambia,
  larghezza = 600,
  altezza = 200,
}: {
  /** Подписът като PNG data URL, или `null`, ако платното е празно. */
  onCambia: (dataUrl: string | null) => void;
  larghezza?: number;
  altezza?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const disegna = useRef(false);
  const [vuoto, setVuoto] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // Платното се рисува в устройствени пиксели, иначе щрихът е размазан на
    // екран с висока плътност — точно екраните, на които се подписва.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = larghezza * dpr;
    c.height = altezza * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [larghezza, altezza]);

  function posizione(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function inizio(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    disegna.current = true;
    const { x, y } = posizione(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function muovi(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!disegna.current) return;
    // Задължително: без него страницата скролва под пръста, докато се подписва.
    e.preventDefault();
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posizione(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vuoto) setVuoto(false);
  }

  function fine() {
    if (!disegna.current) return;
    disegna.current = false;
    const c = ref.current;
    if (c) onCambia(vuoto ? null : c.toDataURL("image/png"));
  }

  function azzera() {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setVuoto(true);
    onCambia(null);
  }

  return (
    <div>
      <div className="relative inline-block rounded-md border border-border bg-white">
        <canvas
          ref={ref}
          style={{ width: larghezza, height: altezza, touchAction: "none" }}
          className="block cursor-crosshair rounded-md"
          onPointerDown={inizio}
          onPointerMove={muovi}
          onPointerUp={fine}
          onPointerCancel={fine}
          aria-label="Spazio per la firma"
          role="img"
        />
        {vuoto && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Firmare qui
          </span>
        )}
        {!vuoto && (
          <button
            type="button"
            className="btn-ghost absolute right-1 top-1 inline-flex h-7 items-center gap-1 px-2 text-xs"
            onClick={azzera}
          >
            <IcoChiudi />
            Cancella
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-3">
        La firma vale come accettazione dell&apos;intervento descritto. Non è
        una firma elettronica qualificata.
      </p>
    </div>
  );
}
