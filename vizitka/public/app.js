// Vizitka — клиентска логика (CSP-safe, без inline скриптове).
(function () {
  'use strict';

  // Бутон „Копирай линка“.
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const input = document.querySelector(btn.getAttribute('data-copy'));
      if (!input) return;
      const done = function () {
        const original = btn.textContent;
        btn.textContent = 'Копирано ✓';
        setTimeout(function () {
          btn.textContent = original;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(done);
      } else {
        input.select();
        document.execCommand('copy');
        done();
      }
    });
  });

  // Потвърждение преди необратими действия (напр. изтриване на банер).
  document.querySelectorAll('[data-confirm]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!window.confirm(btn.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Превключвател за собствен цвят: изключеното поле не се изпраща → пада на темата.
  const accentOn = document.getElementById('accent-on');
  const accentInput = document.getElementById('accent-input');
  if (accentOn && accentInput) {
    accentOn.addEventListener('change', function () {
      accentInput.disabled = !accentOn.checked;
    });
  }

  // „Още един бутон“: клонира ред за връзка със следващ индекс, до maxLinks.
  const addLink = document.getElementById('add-link');
  const linksList = document.getElementById('links-list');
  if (addLink && linksList) {
    addLink.addEventListener('click', function () {
      const rows = linksList.querySelectorAll('.link-row');
      const i = rows.length;
      if (i >= Number(addLink.getAttribute('data-max'))) {
        addLink.disabled = true;
        return;
      }
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML =
        '<input type="text" name="link_icon_' +
        i +
        '" maxlength="8" placeholder="🔗" class="link-icon-in" aria-label="Икона">' +
        '<input type="text" name="link_label_' +
        i +
        '" maxlength="60" placeholder="Надпис (напр. WhatsApp)" aria-label="Надпис">' +
        '<input type="url" name="link_url_' +
        i +
        '" maxlength="300" placeholder="https://…" aria-label="Връзка">';
      linksList.appendChild(row);
      if (i + 1 >= Number(addLink.getAttribute('data-max'))) addLink.disabled = true;
    });
  }
})();
