// Element picker + zapper: "pick" hides an element and remembers the selector
// per site; "zap" removes an element once, for this page only (no rule saved).
(function () {
  const host = location.hostname.replace(/^www\./, "");
  let picking = false;
  let mode = "pick"; // "pick" | "zap"
  let box = null;
  let tip = null;
  let target = null;

  // Build a reasonably specific selector for an element.
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return "#" + el.id;

    const parts = [];
    let node = el;
    let depth = 0;

    while (node && node.nodeType === 1 && node !== document.body && depth < 5) {
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList).filter(
        (c) => /^[a-zA-Z][\w-]{1,}$/.test(c) && c.length < 30
      );

      if (classes.length) {
        part += "." + classes.slice(0, 2).map((c) => CSS.escape(c)).join(".");
      } else {
        const parent = node.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }

      parts.unshift(part);
      try {
        if (document.querySelectorAll(parts.join(" > ")).length === 1) break;
      } catch {}
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function place(el) {
    if (!box || !el) return;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      top: r.top + "px",
      left: r.left + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
  }

  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === tip) return;
    target = el;
    place(el);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!target) return;
    if (mode === "zap") {
      // Еднократно махане, само за тази страница — нищо не се записва.
      try { target.remove(); } catch {}
      stop();
      return;
    }
    const selector = selectorFor(target);
    if (selector) {
      try {
        target.style.setProperty("display", "none", "important");
      } catch {}
      chrome.runtime.sendMessage({ type: "saveCustomSelector", host, selector });
    }
    stop();
  }

  function onKey(e) {
    if (e.key === "Escape") stop();
  }

  function start(m) {
    if (picking) return;
    mode = m === "zap" ? "zap" : "pick";
    picking = true;
    document.documentElement.classList.add("tbab-picking");

    box = document.createElement("div");
    box.id = "tbab-picker-box";
    tip = document.createElement("div");
    tip.id = "tbab-picker-tip";
    tip.innerHTML = (mode === "zap"
      ? "Click to remove this element (once) &nbsp;•&nbsp; <b>Esc</b> to cancel"
      : "Click an element to hide it &nbsp;•&nbsp; <b>Esc</b> to cancel");
    document.body.append(box, tip);

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function stop() {
    picking = false;
    document.documentElement.classList.remove("tbab-picking");
    box?.remove();
    tip?.remove();
    box = tip = target = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "activatePicker") start("pick");
    else if (msg.type === "activateZapper") start("zap");
  });
})();
