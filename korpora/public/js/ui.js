// Small progressive enhancements for the signed-in pages; every form works without them.
(function () {
  'use strict';

  // a question before destructive actions (ban, delete, 2FA reset): the page's own dialog (the template from
  // page-bottom.ejs) with the question from data-confirm and the form's own button as the answer; Escape or "Go
  // back" leaves everything as it was. Where <dialog> is missing, the browser's box asks instead
  var template = document.getElementById('confirm-dialog');
  var confirmed = typeof WeakSet === 'function' ? new WeakSet() : null;
  var canAsk =
    !!(template && template.content && confirmed) && typeof HTMLDialogElement === 'function';
  var ask = function (form, submitter) {
    var dialog = template.content.firstElementChild.cloneNode(true);
    var button =
      submitter && submitter.form === form ? submitter : form.querySelector('[type="submit"]');
    var ok = dialog.querySelector('[data-ok]');
    dialog.querySelector('#confirm-q').textContent = form.getAttribute('data-confirm');
    ok.textContent = (button && button.textContent.trim()) || '';
    if (!ok.textContent) ok.hidden = true;
    dialog.addEventListener('close', function () {
      var yes = dialog.returnValue === 'ok';
      dialog.remove();
      if (yes) {
        confirmed.add(form);
        if (form.requestSubmit) form.requestSubmit(button || undefined);
        else form.submit();
      } else if (button) {
        button.focus();
      }
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  };
  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target.closest ? event.target.closest('form[data-confirm]') : null;
      if (!form) return;
      if (!canAsk) {
        if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
        return;
      }
      // the second submit, after "yes", goes through
      if (confirmed.has(form)) {
        confirmed.delete(form);
        return;
      }
      event.preventDefault();
      ask(form, event.submitter);
    },
    true,
  );

  // copy the text of an element (recovery codes); the result, success or failure, goes to the live region
  // named by data-status, so a screen reader says it too; when the browser refuses, the text is also selected
  // for Ctrl+C
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    var statusSelector = button.getAttribute('data-status');
    var status = statusSelector ? document.querySelector(statusSelector) : null;
    var timer = 0;
    var say = function (message, clearAfter) {
      if (!status) return;
      window.clearTimeout(timer);
      status.textContent = message;
      if (clearAfter)
        timer = window.setTimeout(function () {
          status.textContent = '';
        }, clearAfter);
    };
    button.addEventListener('click', function () {
      var target = document.querySelector(button.getAttribute('data-copy'));
      if (!target) return;
      var failed = function () {
        var range = document.createRange();
        range.selectNodeContents(target);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        say(button.getAttribute('data-failed') || '', 0);
      };
      if (!navigator.clipboard) {
        failed();
        return;
      }
      var text =
        Array.prototype.map
          .call(target.querySelectorAll('li'), function (li) {
            return li.textContent.trim();
          })
          .join('\n') || target.textContent;
      say('', 0);
      navigator.clipboard.writeText(text).then(function () {
        say(button.getAttribute('data-done') || '', 4000);
      }, failed);
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

  // the admin tabs on a phone scroll sideways when they do not fit: the current tab comes into view, and the side
  // where more tabs wait is marked (data-more) so the CSS fades it out
  Array.prototype.forEach.call(document.querySelectorAll('.subnav-admin'), function (nav) {
    var mark = function () {
      var more = [];
      if (nav.scrollLeft > 1) more.push('start');
      if (nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1) more.push('end');
      if (more.length) nav.setAttribute('data-more', more.join(' '));
      else nav.removeAttribute('data-more');
    };
    var current = nav.querySelector('[aria-current="page"]');
    if (current && nav.scrollWidth > nav.clientWidth) {
      var left = current.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollLeft += left - (nav.clientWidth - current.offsetWidth) / 2;
    }
    mark();
    nav.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('resize', mark);
  });

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
