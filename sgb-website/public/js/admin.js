/* Админ JS — мобилно меню, RTE редактор, потвърждения */
(function () {
  'use strict';

  // Мобилен сайдбар
  var burger = document.getElementById('admin-burger');
  var sidebar = document.getElementById('admin-sidebar');
  if (burger && sidebar) {
    burger.addEventListener('click', function () {
      var open = sidebar.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 880 && sidebar.classList.contains('is-open') &&
          !sidebar.contains(e.target) && e.target !== burger && !burger.contains(e.target)) {
        sidebar.classList.remove('is-open');
      }
    });
  }

  // Потвърждение преди изтриване
  document.querySelectorAll('[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // „Запазено“ известие при ?saved=1
  if (/[?&]saved=1/.test(window.location.search)) {
    var toast = document.getElementById('save-toast');
    if (toast) {
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 2600);
    }
  }

  // ---------- Rich text editor ----------
  var editor = document.getElementById('rte-editor');
  var source = document.getElementById('rte-source');
  if (editor && source) {
    var rte = editor.closest('.rte');
    var sync = function () { source.value = editor.innerHTML.trim(); };
    editor.addEventListener('input', sync);
    editor.addEventListener('blur', sync);

    rte.querySelectorAll('[data-cmd]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        var cmd = btn.getAttribute('data-cmd');
        var val = btn.getAttribute('data-val') || null;
        editor.focus();
        if (cmd === 'createLink') {
          var url = window.prompt('Въведете адрес (URL):', 'https://');
          if (url) document.execCommand('createLink', false, url);
        } else if (cmd === 'formatBlock') {
          document.execCommand('formatBlock', false, val);
        } else {
          document.execCommand(cmd, false, val);
        }
        sync();
      });
    });

    // Превключване HTML изглед
    var htmlBtn = rte.querySelector('[data-toggle-html]');
    if (htmlBtn) {
      htmlBtn.addEventListener('click', function () {
        if (source.hidden) {
          sync();
          source.hidden = false;
          editor.style.display = 'none';
          htmlBtn.classList.add('is-active');
        } else {
          editor.innerHTML = source.value || '<p></p>';
          source.hidden = true;
          editor.style.display = '';
          htmlBtn.classList.remove('is-active');
        }
      });
    }

    // Синхронизирай при изпращане
    var form = editor.closest('form');
    if (form) form.addEventListener('submit', function () { if (source.hidden) sync(); });
  }

  // Автоматичен slug от заглавие (само за нови записи с празно поле)
  var title = document.getElementById('title');
  var slug = document.getElementById('slug');
  if (title && slug && !slug.value) {
    var map = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'y','ю':'yu','я':'ya' };
    var touched = false;
    slug.addEventListener('input', function () { touched = true; });
    title.addEventListener('input', function () {
      if (touched) return;
      slug.value = title.value.toLowerCase().split('').map(function (c) { return map[c] !== undefined ? map[c] : c; }).join('')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    });
  }
})();
