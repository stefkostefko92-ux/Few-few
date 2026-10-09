// Small enhancements of the account pages; every form works without them.
(function () {
  'use strict';

  // print the recovery codes (the print style keeps only them on the page); the button exists only with JS
  Array.prototype.forEach.call(document.querySelectorAll('[data-print]'), function (button) {
    button.hidden = false;
    button.addEventListener('click', function () {
      window.print();
    });
  });

  // the plan order form: a draft of the choices in this tab, so switching the language does not lose the
  // invoice details; cleared when the order is sent. The early-start box is never restored: that request is
  // ticked by hand on the page that sends it, never in advance
  var form = document.querySelector('form[data-draft]');
  var storage = null;
  try {
    storage = window.sessionStorage;
  } catch (error) {
    // blocked site data: no draft
  }
  if (form && storage) {
    var key = 'korpora:' + form.getAttribute('data-draft');
    var fields = form.querySelectorAll('input[type=radio], textarea');
    var save = function () {
      var draft = {};
      Array.prototype.forEach.call(fields, function (field) {
        if (field.type !== 'radio') draft[field.name] = field.value;
        else if (field.checked) draft[field.name] = field.value;
      });
      try {
        storage.setItem(key, JSON.stringify(draft));
      } catch (error) {
        // storage full or blocked: the form still works, only the draft is not kept
      }
    };
    var draft = null;
    try {
      draft = JSON.parse(storage.getItem(key) || 'null');
    } catch (error) {
      draft = null;
    }
    if (draft && typeof draft === 'object') {
      Array.prototype.forEach.call(fields, function (field) {
        if (!Object.prototype.hasOwnProperty.call(draft, field.name)) return;
        var value = draft[field.name];
        if (field.type === 'radio') field.checked = field.value === value;
        else if (typeof value === 'string') field.value = value.slice(0, 1000);
      });
    }
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    form.addEventListener('submit', function () {
      try {
        storage.removeItem(key);
      } catch (error) {
        // nothing to clear
      }
    });
  }
})();
