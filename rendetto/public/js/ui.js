// Small progressive enhancements for the signed-in pages; every form works without them.
(function () {
  'use strict';

  // a question before destructive actions (ban, delete, 2FA reset)
  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target.closest ? event.target.closest('form[data-confirm]') : null;
      if (form && !window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
    },
    true,
  );

  // copy the text of an element (recovery codes); when the browser refuses, the text is selected for Ctrl+C
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    var label = button.lastChild;
    var original = label.textContent; // kept once: a click during the "copied" label cannot replace it
    var timer = 0;
    button.addEventListener('click', function () {
      var target = document.querySelector(button.getAttribute('data-copy'));
      if (!target) return;
      var select = function () {
        var range = document.createRange();
        range.selectNodeContents(target);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      };
      if (!navigator.clipboard) {
        select();
        return;
      }
      var text =
        Array.prototype.map
          .call(target.querySelectorAll('li'), function (li) {
            return li.textContent.trim();
          })
          .join('\n') || target.textContent;
      navigator.clipboard.writeText(text).then(function () {
        label.textContent = button.getAttribute('data-done') || original;
        window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          label.textContent = original;
        }, 1800);
      }, select);
    });
  });

  // a table wider than its box scrolls sideways: then the box is a named, focusable region, so the keyboard can
  // scroll it too; checked again when the window is resized
  var wraps = document.querySelectorAll('.table-wrap');
  var labelOf = function (wrap) {
    var caption = wrap.querySelector('caption');
    if (caption) return caption.textContent.trim();
    for (var el = wrap.previousElementSibling; el; el = el.previousElementSibling)
      if (/^H[1-6]$/.test(el.tagName)) return el.textContent.trim();
    return '';
  };
  var regions = function () {
    Array.prototype.forEach.call(wraps, function (wrap) {
      var scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
      if (scrolls && !wrap.hasAttribute('tabindex')) {
        var label = labelOf(wrap);
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('data-region', '');
        if (label) {
          wrap.setAttribute('role', 'region');
          wrap.setAttribute('aria-label', label);
        }
      } else if (!scrolls && wrap.hasAttribute('data-region')) {
        ['tabindex', 'data-region', 'role', 'aria-label'].forEach(function (name) {
          wrap.removeAttribute(name);
        });
      }
    });
  };
  if (wraps.length) {
    var pending = 0;
    regions();
    // the web fonts can arrive later and widen the cells
    if (document.fonts) document.fonts.ready.then(regions);
    window.addEventListener('resize', function () {
      if (pending) return;
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        regions();
      });
    });
  }

  // plan forms: show only the fields of the chosen plan
  Array.prototype.forEach.call(document.querySelectorAll('[data-plan-form]'), function (form) {
    var select = form.querySelector('[data-plan-select]');
    if (!select) return;
    var sync = function () {
      Array.prototype.forEach.call(form.querySelectorAll('[data-for-plan]'), function (el) {
        el.hidden = el.getAttribute('data-for-plan') !== select.value;
      });
    };
    select.addEventListener('change', sync);
    sync();
  });
})();
