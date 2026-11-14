// The browser's own message for an empty or wrong field comes in the browser's language, in a bubble that
// fades away. Here it comes in the page's language (the texts are on this script's tag,
// views/partials/form-check.ejs) and stays under the field, like the errors from the server: the first wrong
// field gets the focus and a screen reader reads the message with it. The browser's checks still stop the form;
// without this script they speak in their own language.
(function () {
  'use strict';

  var tag = document.currentScript;
  if (!tag) return;
  var text = function (name) {
    return tag.getAttribute('data-' + name) || '';
  };
  var serial = 0;
  // the browser names the wrong fields one after another in one go: the first of them takes the focus
  var focused = false;

  // a group of radio buttons answers as one: its first button carries the message
  var owner = function (field) {
    if (field.type !== 'radio' || !field.form || !field.name) return field;
    var group = field.form.elements.namedItem(field.name);
    return group && group.length ? group[0] : field;
  };

  var message = function (field) {
    var v = field.validity;
    if (v.valueMissing) {
      if (field.type === 'checkbox') return text('check');
      if (field.type === 'radio' || field.tagName === 'SELECT') return text('choose');
      return text('required');
    }
    if (v.typeMismatch && field.type === 'email') return text('email');
    if (v.tooShort) return text('short').replace('{n}', String(field.minLength));
    if (v.tooLong) return text('long').replace('{n}', String(field.maxLength));
    return field.getAttribute('data-invalid') || text('invalid');
  };

  var describedBy = function (field) {
    return (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  };

  var setDescribedBy = function (field, ids) {
    if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
    else field.removeAttribute('aria-describedby');
  };

  var show = function (field) {
    var id = field.getAttribute('data-error-id');
    var note = id ? document.getElementById(id) : null;
    if (!note) {
      // the server's error under this field was about the value sent before — this one replaces it
      var ids = describedBy(field).filter(function (other) {
        var old = document.getElementById(other);
        if (!old || !old.classList.contains('field-error')) return true;
        old.remove();
        return false;
      });
      serial += 1;
      id = 'field-check-' + serial;
      note = document.createElement('p');
      note.className = 'field-error';
      note.id = id;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'i');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-alert');
      svg.appendChild(use);
      note.appendChild(svg);
      note.appendChild(document.createElement('span'));
      // under the field, or under the whole line of a box to tick
      var after =
        field.type === 'checkbox' || field.type === 'radio'
          ? field.closest('label') || field
          : field;
      after.insertAdjacentElement('afterend', note);
      field.setAttribute('data-error-id', id);
      setDescribedBy(field, [id].concat(ids));
    }
    note.lastChild.textContent = message(field);
    field.setAttribute('aria-invalid', 'true');
  };

  var clear = function (field) {
    var id = field.getAttribute('data-error-id');
    if (!id) return;
    var note = document.getElementById(id);
    if (note) note.remove();
    field.removeAttribute('data-error-id');
    field.removeAttribute('aria-invalid');
    setDescribedBy(
      field,
      describedBy(field).filter(function (other) {
        return other !== id;
      }),
    );
  };

  // the browser checks the form before sending it and names every wrong field; its bubble stays away
  document.addEventListener(
    'invalid',
    function (event) {
      var field = event.target;
      if (!field || !field.validity || !field.form) return;
      event.preventDefault();
      var first = owner(field);
      show(first);
      if (!focused) {
        focused = true;
        first.focus();
        window.setTimeout(function () {
          focused = false;
        }, 0);
      }
    },
    true,
  );

  // while typing the message only goes away; a new one comes when the field is left or the form is sent
  var recheck = function (clearOnly) {
    return function (event) {
      var field = event.target && event.target.validity ? owner(event.target) : null;
      if (!field || !field.getAttribute('data-error-id')) return;
      if (field.validity.valid) clear(field);
      else if (!clearOnly) show(field);
    };
  };
  document.addEventListener('input', recheck(true));
  document.addEventListener('change', recheck(false));
})();
