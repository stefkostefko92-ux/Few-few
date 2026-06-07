// Few-Few AdBlocker - element picker
// Спи, докато получи "activatePicker" от popup-а. Тогава подсветява елементи
// при hover, а при клик генерира CSS селектор, скрива елемента и го запазва
// за този домейн (прилага се автоматично при следващи посещения).

(function () {
  "use strict";

  const HOST = location.hostname.replace(/^www\./, "");
  let picking = false;
  let highlight = null;
  let tip = null;
  let current = null;

  // Генерира достатъчно специфичен CSS селектор за елемент.
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1. Стабилно id.
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      return "#" + el.id;
    }

    const parts = [];
    let node = el;
    let depth = 0;

    while (node && node.nodeType === 1 && node !== document.body && depth < 5) {
      let part = node.tagName.toLowerCase();

      // Добави "смислени" класове (без динамично генерираните).
      const classes = Array.from(node.classList).filter(
        (c) => /^[a-zA-Z][\w-]{1,}$/.test(c) && c.length < 30
      );
      if (classes.length) {
        part += "." + classes.slice(0, 2).map((c) => CSS.escape(c)).join(".");
      } else {
        // Иначе използвай позиция спрямо съседите.
        const parent = node.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter(
            (c) => c.tagName === node.tagName
          );
          if (sameTag.length > 1) {
            part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
          }
        }
      }

      parts.unshift(part);

      // Ако вече е уникален, спри.
      try {
        if (document.querySelectorAll(parts.join(" > ")).length === 1) break;
      } catch (e) {}

      node = node.parentElement;
      depth++;
    }

    return parts.join(" > ");
  }

  function moveHighlight(el) {
    if (!highlight || !el) return;
    const r = el.getBoundingClientRect();
    highlight.style.top = r.top + "px";
    highlight.style.left = r.left + "px";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
  }

  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlight || el === tip) return;
    current = el;
    moveHighlight(el);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!current) return;

    const selector = buildSelector(current);
    if (selector) {
      try {
        current.style.setProperty("display", "none", "important");
      } catch (err) {}
      chrome.runtime.sendMessage({
        type: "saveCustomSelector",
        host: HOST,
        selector,
      });
    }
    stop();
  }

  function onKey(e) {
    if (e.key === "Escape") stop();
  }

  function start() {
    if (picking) return;
    picking = true;
    document.documentElement.classList.add("fewfew-picking");

    highlight = document.createElement("div");
    highlight.id = "fewfew-picker-highlight";
    tip = document.createElement("div");
    tip.id = "fewfew-picker-tip";
    tip.innerHTML =
      "Кликни елемент за да го скриеш &nbsp;•&nbsp; <b>Esc</b> за отказ";
    document.body.appendChild(highlight);
    document.body.appendChild(tip);

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function stop() {
    picking = false;
    document.documentElement.classList.remove("fewfew-picking");
    highlight?.remove();
    tip?.remove();
    highlight = tip = current = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "activatePicker") start();
  });
})();
