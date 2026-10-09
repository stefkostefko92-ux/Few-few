// Mini-helper за DOM. Всичко текстово от сървъра влиза само като text node (textContent) —
// тук няма път за innerHTML.

export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function show(node, visible) {
  node.hidden = !visible;
}

/** Диалог за потвърждение на необратимо действие → Promise<boolean>. Фокусът е върху „Отказ“. */
export function confirmAction({ title, text, confirmLabel, cancelLabel }) {
  const dlg = $('#dlg-confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = confirmLabel;
  $('#confirm-no').textContent = cancelLabel;
  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'yes');
    };
    dlg.returnValue = 'no';
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    $('#confirm-no').focus();
  });
}

export function announce(text) {
  const region = document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  // Малка пауза, за да прочете екранният четец и повторно същия текст.
  setTimeout(() => {
    region.textContent = text;
  }, 60);
}
