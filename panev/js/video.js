/* Видеата за монтаж (templates/videos.mjs): до клика страницата показва наша снимка и известие, без нищо от Google.
   Кликът върху снимката (съгласието за това видео, правният преглед 26.11.2026) я сменя с плейъра на YouTube от
   youtube-nocookie.com. Изборът не се помни: при ново отваряне на страницата пак има снимка и известие.
   Без JS снимката е линк към YouTube. Минутите до стъпките превъртат вече заредения плейър (postMessage, без
   скрипта с API-то на YouTube); докато плейърът се зарежда, минутата го презарежда от този момент (&start=);
   ако плейърът не е пускан, линкът отваря клипа в YouTube в нов раздел. */
(function () {
  'use strict';
  var HOST = 'https://www.youtube-nocookie.com';
  var EMBED = 'https://www.youtube-nocookie.com/embed/';

  function source(fig, start) {
    return EMBED + encodeURIComponent(fig.getAttribute('data-yt')) + '?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' +
      encodeURIComponent(window.location.origin) + (start ? '&start=' + start : '');
  }

  function load(fig) {
    var frame = document.createElement('iframe');
    frame.src = source(fig, 0);
    // Командите с postMessage стигат до плейъра чак след като документът му е зареден: дотогава съобщението
    // се изхвърля тихо (targetOrigin не съвпада с about:blank).
    frame.addEventListener('load', function () { frame.setAttribute('data-ready', '1'); });
    frame.title = fig.getAttribute('data-title') || '';
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    fig.querySelector('.yt-frame').replaceChildren(frame);
    fig.classList.add('is-playing');
    frame.focus();
  }

  function command(frame, func, args) {
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), HOST);
  }

  var figures = document.querySelectorAll('figure.yt[data-yt]');
  Array.prototype.forEach.call(figures, function (fig) {
    var poster = fig.querySelector('.yt-poster');
    if (!poster) return;
    poster.addEventListener('click', function (e) {
      // Ctrl/Cmd/Shift/среден бутон: човекът иска YouTube в нов раздел — линкът си върши работата.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      load(fig);
    });
  });

  var links = document.querySelectorAll('[data-yt-seek]');
  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener('click', function (e) {
      var fig = document.querySelector('figure.yt.is-playing');
      var frame = fig && fig.querySelector('iframe');
      if (!frame || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      var at = Number(link.getAttribute('data-yt-seek'));
      if (frame.getAttribute('data-ready') === '1') {
        command(frame, 'seekTo', [at, true]);
        command(frame, 'playVideo');
      } else {
        frame.removeAttribute('data-ready');
        frame.src = source(fig, at);
      }
      var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      fig.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    });
  });
})();
