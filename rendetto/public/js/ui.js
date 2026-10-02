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

  // copy the text of an element (recovery codes)
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () {
      var target = document.querySelector(button.getAttribute('data-copy'));
      if (!target || !navigator.clipboard) return;
      var text =
        Array.prototype.map
          .call(target.querySelectorAll('li'), function (li) {
            return li.textContent.trim();
          })
          .join('\n') || target.textContent;
      navigator.clipboard.writeText(text).then(function () {
        var label = button.lastChild;
        var before = label.textContent;
        label.textContent = button.getAttribute('data-done') || before;
        window.setTimeout(function () {
          label.textContent = before;
        }, 1800);
      });
    });
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
