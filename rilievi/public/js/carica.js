// The upload of photos and videos in each section (views/schede/_allegati.ejs). Without this file the
// upload form posts and comes back to its section. Here it is checked first (count, size by kind), the
// photos larger than the server keeps get smaller on the phone, and it is sent in the background with
// its progress; the section's gallery comes back in place (allegati.js, loaded before this file).
(() => {
  'use strict';

  const shared = window.rilieviAllegati;
  if (!shared) return;
  const { boxOf, textsOf, fill, notice, read, show } = shared;
  const MB = 1024 * 1024;

  // The server keeps at most 2560 px on the long side (src/allegati/foto.ts): a 12-48 Mpx photo of
  // 3-12 MB is made that size here and travels as JPEG of about 1 MB — on the mobile network of a
  // basement or a lift shaft that is minutes. Drawn again, it also leaves its metadata (the position,
  // the phone) on the phone. Only a photo larger than that, and only when this browser draws photos the
  // right way up (checked once on a tiny one); anything else goes as it is — the server reduces it.
  const LONG_SIDE = 2560;
  const QUALITY = 0.9;
  const KINDS = /^image\/(jpeg|png|webp|avif|heic|heif)$/;
  // 2 x 1 pixels with EXIF orientation 6 (turn right): drawn the right way up it is 1 x 2.
  const TURNED =
    '/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAIAAAADoAQAAQAAAAEAAAAAAAAA/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/9sAQwEREhIYFRgvGhovY0I4QmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj/8AAEQgAAQACAwEiAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AAAP/9k=';
  const worthShrinking = (file) => KINDS.test(file.type) && typeof createImageBitmap === 'function';
  let upright = null;
  const drawsUpright = () => {
    if (!upright)
      upright = (async () => {
        try {
          const bytes = Uint8Array.from(atob(TURNED), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          const ok = bitmap.width === 1 && bitmap.height === 2;
          bitmap.close();
          return ok;
        } catch {
          return false;
        }
      })();
    return upright;
  };
  const shrink = async (file) => {
    if (!worthShrinking(file) || !(await drawsUpright())) return file;
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = LONG_SIDE / Math.max(bitmap.width, bitmap.height);
      if (scale >= 1) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      // Transparency on white, as the server does.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
      // A phone keeps a large canvas in memory until it is emptied.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob || blob.size >= file.size) return file;
      const name = `${file.name.replace(/\.[^.]*$/, '') || 'foto'}.jpg`;
      return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch {
      return file;
    } finally {
      if (bitmap) bitmap.close();
    }
  };
  // One at a time: a phone has memory for one large photo, not for ten.
  const shrinkAll = async (files) => {
    const ready = [];
    for (const file of files) ready.push(await shrink(file));
    return ready;
  };

  // The controls sit in the section (`form=`), not in the form: looked up there, not in the whole page.
  document.querySelectorAll('form[data-carica]').forEach((form) => {
    const sezione = form.dataset.carica;
    const box = boxOf(sezione);
    const wrap = document.getElementById(`a-${sezione}`);
    if (!box || !wrap) return;
    const input = wrap.querySelector(`input[type="file"][form="${form.id}"]`);
    const caption = wrap.querySelector(`input[name="didascalia"][form="${form.id}"]`);
    const progress = wrap.querySelector('[data-progress]');
    const button = wrap.querySelector(`button[form="${form.id}"]`);
    if (!input) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const texts = textsOf(sezione);
      let files = Array.from(input.files || []);
      if (!files.length) return notice(sezione, [texts.msgNessuno], true);
      if (files.length > Number(texts.maxFile)) return notice(sezione, [texts.msgTroppi], true);
      const done = () => {
        if (button) button.disabled = false;
        if (progress) progress.hidden = true;
      };
      // The button stays off from here (Enter in the caption cannot send twice).
      if (button) button.disabled = true;
      // Photos larger than the server keeps get smaller on the phone first.
      if (files.some(worthShrinking)) {
        notice(sezione, [texts.msgPreparazione]);
        files = await shrinkAll(files);
      }
      // An unknown kind gets the larger limit: the server knows it from the bytes.
      const limitOf = (file) =>
        Number(file.type.startsWith('image/') ? texts.maxFoto : texts.maxVideo);
      const total = files.reduce((sum, file) => sum + file.size, 0);
      const overTotal = total > Number(texts.maxVideo) * MB;
      const tooBig = files.filter((file) => file.size > limitOf(file) * MB);
      if (overTotal || tooBig.length) {
        done();
        return notice(
          sezione,
          overTotal
            ? [texts.msgTotale]
            : tooBig.map((file) => fill(texts.msgGrande, { nome: file.name, mb: limitOf(file) })),
          true,
        );
      }

      const xhr = new XMLHttpRequest();
      let told = -1;
      if (progress) {
        progress.value = 0;
        progress.hidden = false;
      }
      notice(sezione, [fill(texts.msgCaricamento, { pct: 0 })]);
      xhr.upload.addEventListener('progress', (step) => {
        if (!step.lengthComputable) return;
        const pct = Math.round((step.loaded / step.total) * 100);
        if (progress) progress.value = pct;
        // The live region speaks at every quarter, not at every packet.
        const quarter = Math.floor(pct / 25);
        if (quarter !== told) {
          told = quarter;
          notice(sezione, [fill(texts.msgCaricamento, { pct })]);
        }
      });
      xhr.addEventListener('load', async () => {
        done();
        let result = null;
        try {
          const response = new Response(xhr.response, {
            status: xhr.status,
            headers: { 'content-type': xhr.getResponseHeader('content-type') || '' },
          });
          result = await read(response, sezione);
        } catch {
          notice(sezione, [texts.msgErrore], true);
        }
        if (!result) return;
        if (result.ok) {
          input.value = '';
          if (caption) caption.value = '';
        }
        show(box, result.html);
        notice(sezione, [result.ok, ...result.avvisi], result.avvisi.length > 0);
        // All of it went in: the new tiles say the rest, the upload folds away.
        const fold = input.closest('details');
        if (fold && result.ok && !result.avvisi.length) fold.open = false;
      });
      xhr.addEventListener('error', () => {
        done();
        notice(sezione, [texts.msgRete], true);
      });
      // The form's own fields (token, section, caption) and the files as prepared above.
      const data = new FormData(form);
      data.delete('file');
      files.forEach((file) => data.append('file', file, file.name));
      xhr.open('POST', form.action);
      xhr.setRequestHeader('X-Partial', '1');
      xhr.send(data);
    });
  });
})();
