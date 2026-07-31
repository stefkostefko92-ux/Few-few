// Mascot.tsx — АВТОГЕНЕРИРАН от tools/agents/mascots.mjs. Не редактирай на ръка.
// Анатомията е по образеца на собственика; цветът идва от акцента на агента в agents.json.
import "./Mascot.css";

export const AGENTS = {
  "pravniyat-razbirach": { color: "#c9a227", name: "Правният Разбирач" },
  "kodadjiyata": { color: "#2f9e6f", name: "Кодаджията" },
  "kachestveniyat": { color: "#7c6cf0", name: "Качествения" },
  "geymara": { color: "#6f7bf7", name: "Геймъра" },
  "seo": { color: "#e0663b", name: "SEO" },
  "skorostnika": { color: "#facc15", name: "Скоростника" },
  "prevodach": { color: "#b057c9", name: "Преводач" },
  "siydara": { color: "#3aa0c9", name: "Сийдъра" },
  "vps-adjiyata": { color: "#8a9bb0", name: "VPS-аджията" },
  "3d-maniac": { color: "#d64f7a", name: "3D Maniac" },
  "socialdjiyata": { color: "#ff3d71", name: "Социалджията" },
  "prodavacha": { color: "#635bff", name: "Продавача" },
  "mobildjiyata": { color: "#30b06a", name: "Мобилджията" },
  "printadjiyata": { color: "#f26322", name: "Принтаджията" },
  "dizayner": { color: "#b026ff", name: "Дизайнера" },
  "hromadjiyata": { color: "#1a73e8", name: "Хромаджията" },
  "diskordjiyata": { color: "#5865f2", name: "Дискорджията" },
  "treydara": { color: "#16a34a", name: "Трейдъра" },
  "ai-djiyata": { color: "#7c5cff", name: "AI-джията" },
  "kasadjiyata": { color: "#0d9488", name: "Касаджията" },
  "tayniyat-agent": { color: "#dc2626", name: "Тайният агент" },
  "konveyera": { color: "#38bdf8", name: "Конвейерът" },
  "izpitatelya": { color: "#a3e635", name: "Изпитателят" },
  "letopisetsa": { color: "#e879f9", name: "Летописецът" },
  "nabludatelya": { color: "#f59e0b", name: "Наблюдателят" },
  "analizatora": { color: "#4f46e5", name: "Анализаторът" },
  "razbivacha": { color: "#e11d48", name: "Разбивача" },
  "goladjiyata": { color: "#4d7c0f", name: "Голаджията" },
} as const;

export type AgentId = keyof typeof AGENTS;

type MascotProps = { agent?: AgentId; size?: number; color?: string };

/** Изсветлява/потъмнява hex — същата логика като в генератора. */
function shade(hex: string, t: number): string {
  const s = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  const m = t >= 0 ? 255 : 0, k = Math.abs(t);
  const to = (v: number) => Math.round(v + (m - v) * k).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export default function Mascot({ agent, size = 260, color }: MascotProps) {
  const main = color ?? (agent ? AGENTS[agent].color : "#3CFF77");
  const uid = agent ?? "default";
  return (
    <div className="mascot" style={{ ["--size" as string]: `${size}px`, ["--main" as string]: main }}>
      <svg width={size} height={size} viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
           role="img" aria-label={agent ? AGENTS[agent].name : "Маскот"}>
        <defs>
          <radialGradient id={`body-${uid}`} cx="35%" cy="28%">
            <stop offset="0%" stopColor={shade(main, .78)} />
            <stop offset="35%" stopColor={shade(main, .45)} />
            <stop offset="72%" stopColor={main} />
            <stop offset="100%" stopColor={shade(main, -.38)} />
          </radialGradient>
          <radialGradient id={`inner-${uid}`}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={`soft-${uid}`}><feGaussianBlur stdDeviation="12" /></filter>
          <filter id={`shadow-${uid}`}>
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={shade(main, -.55)} floodOpacity=".35" />
          </filter>
        </defs>

        <ellipse cx="150" cy="160" rx="88" ry="104" fill={main} opacity=".18" filter={`url(#soft-${uid})`} />
        <path filter={`url(#shadow-${uid})`} fill={`url(#body-${uid})`}
              d="M150 66 C108 66 78 100 74 146 C70 185 82 228 112 250 C128 262 140 268 150 268 C160 268 172 262 188 250 C218 228 230 185 226 146 C222 100 192 66 150 66Z" />
        <ellipse cx="118" cy="118" rx="22" ry="42" fill={`url(#inner-${uid})`} opacity=".45"
                 transform="rotate(-18 118 118)" />
        <ellipse cx="165" cy="92" rx="10" ry="16" fill="white" opacity=".35" />

        <g className="eye left-eye">
          <ellipse cx="125" cy="145" rx="10" ry="12" fill="#151515" />
          <circle cx="122" cy="141" r="3" fill="#fff" opacity=".95" />
        </g>
        <g className="eye right-eye">
          <ellipse cx="175" cy="145" rx="10" ry="12" fill="#151515" />
          <circle cx="172" cy="141" r="3" fill="#fff" opacity=".95" />
        </g>

        <g className="mascot-glasses" fill="none" stroke="#101010" strokeWidth="6">
          <circle cx="125" cy="145" r="22" /><circle cx="175" cy="145" r="22" />
          <path d="M147 145 h6" strokeWidth="5" />
        </g>
        <path d="M112 118 Q125 112 138 118" stroke={shade(main, -.62)} strokeWidth="4"
              strokeLinecap="round" fill="none" />
        <path d="M162 118 Q175 112 188 118" stroke={shade(main, -.62)} strokeWidth="4"
              strokeLinecap="round" fill="none" />
        <path d="M122 186 Q150 205 178 186" stroke={shade(main, -.66)} strokeWidth="5"
              strokeLinecap="round" fill="none" />

        <polygon points="128,215 112,205 112,225" fill="#0F1E17" />
        <polygon points="172,215 188,205 188,225" fill="#0F1E17" />
        <circle cx="150" cy="215" r="6" fill="#0F1E17" />
      </svg>
    </div>
  );
}
