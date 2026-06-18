import sanitizeHtml from 'sanitize-html';

// Разрешен HTML за тялото на статии/страници (богат текст от админ панела)
const options = {
  allowedTags: [
    'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'blockquote',
    'b', 'strong', 'i', 'em', 'u', 's', 'br', 'hr', 'span', 'div',
    'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'iframe', 'video', 'source', 'pre', 'code', 'sub', 'sup', 'mark', 'small',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'title'],
    video: ['src', 'controls', 'width', 'height', 'poster'],
    source: ['src', 'type'],
    '*': ['class', 'id', 'style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedIframeHostnames: [
    'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
    'player.vimeo.com', 'www.facebook.com', 'web.facebook.com',
  ],
  allowedStyles: {
    '*': {
      'text-align': [/^left$|^right$|^center$|^justify$/],
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/],
      'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/],
      'font-weight': [/^bold$|^normal$|^\d+$/],
      width: [/^\d+(\.\d+)?(px|%|em|rem)$/],
      'max-width': [/^\d+(\.\d+)?(px|%|em|rem)$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs };
      if (out.target === '_blank') out.rel = 'noopener noreferrer';
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: attribs.loading || 'lazy' },
    }),
  },
};

export function cleanHtml(dirty) {
  return sanitizeHtml(dirty || '', options);
}

// Изчисти до чист текст (за excerpt / meta description)
export function toText(html) {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
