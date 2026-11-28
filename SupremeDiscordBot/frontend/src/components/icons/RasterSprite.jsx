// frontend/src/components/icons/RasterSprite.jsx — една икона = клетка от растерния атлас.
//
// Същият интерфейс като иконите на lucide-react, за да не се пипа нито една страница
// освен реда с import: className (w-4 h-4, text-…, animate-spin), size, style, color,
// fill (само за вариантите, нарисувани запълнени — „Star:fill“), aria-*.
// Цветът е currentColor през CSS маска (клас .cs-ico в index.css), така че
// text-cs-cyan, hover:text-… и т.н. работят както преди.
//
// Разлика, за която внимаваме: SVG е заменен елемент и `inline` пази размера му;
// <span> с `inline` губи ширина и височина. Затова `inline` се превръща в `inline-block`.
import { forwardRef } from "react";
import { COLS, ROWS, SPRITE } from "./spriteMap.js";

function cellStyle(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const size = `${COLS * 100}% ${ROWS * 100}%`;
  const pos = `${COLS > 1 ? (col / (COLS - 1)) * 100 : 0}% ${ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0}%`;
  return { maskSize: size, WebkitMaskSize: size, maskPosition: pos, WebkitMaskPosition: pos };
}

export function makeIcon(name) {
  const Icon = forwardRef(function RasterIcon(
    // strokeWidth/absoluteStrokeWidth са пропсове на lucide — тук нямат смисъл, но не бива да стигат до DOM.
    { size, className = "", style, color, fill, strokeWidth: _sw, absoluteStrokeWidth: _asw, ...rest },
    ref,
  ) {
    const filled = fill && fill !== "none" && SPRITE[`${name}:fill`] !== undefined;
    const index = filled ? SPRITE[`${name}:fill`] : SPRITE[name];
    const labelled = rest["aria-label"] || rest["aria-labelledby"] || rest.title;
    const cls = className.replace(/(^|\s)inline(?=\s|$)/, "$1inline-block");
    const dims = size != null ? { width: size, height: size } : null;
    return (
      <span
        ref={ref}
        aria-hidden={labelled ? undefined : "true"}
        role={labelled ? "img" : undefined}
        {...rest}
        className={`cs-ico ${cls}`.trim()}
        style={{ ...(index !== undefined ? cellStyle(index) : null), ...dims, ...(color ? { color } : null), ...style }}
      />
    );
  });
  Icon.displayName = name;
  return Icon;
}
