// A PDF in the app on the iPhone/iPad home screen (the owner, 5 November 2026: "è aperto un pdf non ho
// modo di chiuderlo, se non chiudendo tutta l'applicazione"): there a link to a PDF takes the whole window
// and leaves no way back — WebKit bug 290847 (https://bugs.webkit.org/show_bug.cgi?id=290847), with
// "attachment" and with "inline" alike. So in that app only, a PDF link (data-pdf) fetches the file and
// hands it to the system share sheet (open, save in Files, print, send), which closes by itself; the page
// stays underneath. Anything that is not a PDF (an expired session, a blocked seal) opens as the page it
// is. In the browser, on Android and on the computer the links work as they always did. The texts come
// from the page (body data-pdf-*), in Italian.
(() => {
  'use strict';

  if (window.navigator.standalone !== true) return;
  const testi = document.body.dataset;
  // The file already fetched, when Safari wants a new touch to share it (the touch expired in the wait).
  const pronti = new WeakMap();

  const stato = (link, text) => {
    let el = link.nextElementSibling;
    if (!(el instanceof HTMLElement) || !el.hasAttribute('data-pdf-stato')) {
      el = document.createElement('span');
      el.className = 'pdf-stato';
      el.setAttribute('role', 'status');
      el.setAttribute('data-pdf-stato', '');
      link.after(el);
    }
    el.textContent = text || '';
  };

  const nomeDi = (response) => {
    const match = /filename="?([^";]+)"?/i.exec(response.headers.get('content-disposition') || '');
    return match ? match[1] : 'documento.pdf';
  };

  document.addEventListener('click', async (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-pdf]') : null;
    if (!link || event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    if (typeof navigator.canShare !== 'function' || typeof File !== 'function') {
      stato(link, testi.pdfNonSupportato);
      return;
    }
    let file = pronti.get(link);
    try {
      if (!file) {
        stato(link, testi.pdfAttesa);
        // A redirect is not followed here: the page it leads to would be drawn inside the fetch and eat its
        // one-time message (the blocked seal, src/http/flash.ts) before the window shows it.
        const response = await fetch(link.href, { credentials: 'same-origin', redirect: 'manual' });
        if (response.type === 'opaqueredirect') {
          window.location.href = link.href;
          return;
        }
        const tipo = response.headers.get('content-type') || '';
        if (!tipo.includes('application/pdf')) {
          // The page the server sends instead (sign-in, the sheet with its blocked seal): it has a way back.
          window.location.href = response.url;
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        file = new File([await response.blob()], nomeDi(response), { type: 'application/pdf' });
        if (!navigator.canShare({ files: [file] })) {
          stato(link, testi.pdfNonSupportato);
          return;
        }
      }
      await navigator.share({ files: [file] });
      pronti.delete(link);
      stato(link, '');
    } catch (error) {
      const name = error && typeof error === 'object' ? error.name : '';
      if (name === 'AbortError') {
        pronti.delete(link);
        stato(link, '');
      } else if (name === 'NotAllowedError' && file) {
        pronti.set(link, file);
        stato(link, testi.pdfPronto);
      } else {
        stato(link, testi.pdfErrore);
      }
    }
  });
})();
