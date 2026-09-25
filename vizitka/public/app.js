// Vizitka — клиентска логика (CSP-safe, без inline скриптове).
(function () {
  'use strict';

  // Бутон „Копирай линка“.
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const input = document.querySelector(btn.getAttribute('data-copy'));
      if (!input) return;
      const original = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', original);
      const say = function (text) {
        btn.textContent = text;
        setTimeout(function () {
          btn.textContent = original;
        }, 1800);
      };
      // Резервен път: маркираме текста и опитваме стария execCommand. Ако и той не мине,
      // текстът ОСТАВА маркиран — човекът копира сам, но поне знае, че трябва.
      const fallback = function () {
        input.focus();
        input.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        say(ok ? 'Копирано!' : 'Маркирано — копирай с Ctrl+C');
      };
      // Отказът от клипборда (разрешения, вграден браузър в приложение) НЕ бива да е
      // тих: преди `.then` без `.catch` значеше нищо не е копирано и нищо не е казано.
      // И не само отказ: когато браузърът чака разрешение, което никой не дава,
      // обещанието ВИСИ завинаги (измерено в Chromium) — затова и предпазител по време.
      // `settled` гарантира, че отговорът се казва точно веднъж.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        let settled = false;
        const once = function (fn) {
          return function () {
            if (settled) return;
            settled = true;
            fn();
          };
        };
        const ok = once(function () {
          say('Копирано!');
        });
        const fail = once(fallback);
        navigator.clipboard.writeText(input.value).then(ok, fail);
        setTimeout(fail, 1200);
      } else {
        fallback();
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
        '" maxlength="8" placeholder="Икона" class="link-icon-in" aria-label="Икона">' +
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
