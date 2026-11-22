// Тестове за markdownToHtml — безопасен Markdown → HTML без външни зависимости.
// Проверяваме поведение (какъв HTML получава читателят), не вътрешни функции.
// Новините/текстовете се въвеждат от редактори, затова XSS защитата е критична.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "../markdown";

// Разрешените етикети в изхода; всяко друго „<" би означавало инжектиран HTML.
const ALLOWED_TAG = /<(?!\/?(?:p|h[234]|strong|em|ul|ol|li|blockquote|a)\b)/;
const SAFE_HREF = /^(?:https?:|mailto:|tel:|\/|#)/i;

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

describe("markdownToHtml: екраниране на HTML", () => {
  test("<script> се екранира и не излиза като етикет", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    assert.equal(html, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    assert.ok(!html.includes("<script"));
  });

  test("HTML атрибути (onerror) не стават жив етикет", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">');
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&quot;alert(1)&quot;"));
  });

  test("HTML в текста на връзката се екранира", () => {
    const html = markdownToHtml("[<b>x</b>](https://example.com)");
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;</a>"));
    assert.ok(!html.includes("<b>"));
  });

  test("враждебни входове никога не дават неразрешен етикет или опасен href", () => {
    const hostile = [
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      "<svg/onload=alert(1)>",
      "<iframe src=javascript:alert(1)>",
      "[x](javascript:alert(1))",
      "[x](JaVaScRiPt:alert(1))",
      "[x](data:text/html,<script>alert(1)</script>)",
      "[x](vbscript:msgbox(1))",
      '[x](https://a.com/"onmouseover="alert(1))',
      "[<img src=x onerror=alert(1)>](https://a.com)",
      "[x](&#106;avascript:alert(1))",
      "[x](java&#9;script:alert(1))",
      "## <script>alert(1)</script>",
      "> <script>alert(1)</script>",
      "- <script>alert(1)</script>",
      "**<script>**",
      "*<script>*",
    ];
    for (const input of hostile) {
      const html = markdownToHtml(input);
      assert.ok(!ALLOWED_TAG.test(html), `неразрешен етикет за ${JSON.stringify(input)}: ${html}`);
      for (const href of hrefsOf(html)) {
        assert.match(href, SAFE_HREF, `опасен href за ${JSON.stringify(input)}: ${href}`);
      }
      // Всеки отварящ <a> е точно в позволената форма — без вмъкнат атрибут (onmouseover=…).
      for (const a of html.match(/<a\b[^>]*>/g) ?? []) {
        assert.match(a, /^<a href="[^"<>]*"(?: target="_blank" rel="noopener noreferrer")?>$/, `чужд атрибут за ${JSON.stringify(input)}: ${a}`);
      }
    }
  });
});

describe("markdownToHtml: опасни схеми във връзки", () => {
  test("javascript: връзка се свежда до текста (без <a>)", () => {
    const html = markdownToHtml("[кликни](javascript:alert)");
    assert.equal(html, "<p>кликни</p>");
  });

  test("javascript: със скоби не дава връзка и не пропуска схемата в href", () => {
    const html = markdownToHtml("[x](javascript:alert(1))");
    assert.ok(!html.includes("<a"));
    assert.ok(!html.includes("href"));
    assert.ok(html.startsWith("<p>x"));
  });

  test("схемата не минава с променен регистър", () => {
    const html = markdownToHtml("[x](JaVaScRiPt:alert)");
    assert.equal(html, "<p>x</p>");
  });

  test("data: се свежда до текста", () => {
    assert.equal(markdownToHtml("[x](data:text/html;base64,PHNjcmlwdD4=)"), "<p>x</p>");
  });

  test("vbscript: се свежда до текста", () => {
    assert.equal(markdownToHtml("[x](vbscript:msgbox)"), "<p>x</p>");
  });

  test("\" в адреса не излиза от атрибута", () => {
    const html = markdownToHtml('[x](https://a.com/"onmouseover="alert(1))');
    // Единственият жив атрибут е href — няма инжектиран onmouseover.
    assert.ok(!/<a[^>]*\sonmouseover=/.test(html), html);
    assert.equal(hrefsOf(html).length, 1);
    assert.ok(!/href="[^"]*"[^>]*"/.test(html.replace(/ target="_blank" rel="noopener noreferrer"/, "")), html);
  });
});

describe("markdownToHtml: разрешени връзки", () => {
  test("външна връзка получава target=_blank и rel=\"noopener noreferrer\"", () => {
    const html = markdownToHtml("[сайт](https://example.com/a)");
    assert.equal(
      html,
      '<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">сайт</a></p>',
    );
  });

  test("http връзка също е външна и носи rel", () => {
    assert.match(markdownToHtml("[x](http://example.com)"), /rel="noopener noreferrer"/);
  });

  test("вътрешна връзка и котва са без target/rel", () => {
    assert.equal(markdownToHtml("[новини](/novini)"), '<p><a href="/novini">новини</a></p>');
    assert.equal(markdownToHtml("[горе](#top)"), '<p><a href="#top">горе</a></p>');
  });

  test("mailto: и tel: са разрешени и не отварят нов прозорец", () => {
    assert.equal(markdownToHtml("[пиши](mailto:a@b.bg)"), '<p><a href="mailto:a@b.bg">пиши</a></p>');
    assert.equal(markdownToHtml("[звъни](tel:+359888)"), '<p><a href="tel:+359888">звъни</a></p>');
  });

  // ПОПРАВЕН 21.11.2026 (беше todo): „&" в адреса се екранираше два пъти (inline() екранира целия
  // текст, после href се екранира пак) → браузърът получава „…?a=1&amp;b=2" и
  // параметърът се чете като „amp;b". Поправка: в markdown.ts да се ползва
  // `href` вместо `escapeHtml(href)` — входът вече е екраниран.
  test(
    "„&“ в адреса се екранира веднъж (&amp;), не два пъти",
    () => {
      const html = markdownToHtml("[x](https://a.com/?a=1&b=2)");
      assert.ok(html.includes('href="https://a.com/?a=1&amp;b=2"'), html);
    },
  );

  // ПОПРАВЕН 21.11.2026 (беше todo): „*" в адреса ставаше <em> вътре в атрибута.
  test(
    "„*“ в адреса не се третира като курсив",
    () => {
      const html = markdownToHtml("[x](https://a.com/*a*)");
      assert.ok(!html.includes("<em>"), html);
    },
  );

  // ПОПРАВЕН 21.11.2026 (беше todo): вложените скоби на отхвърлена връзка оставяха „)“.
  test(
    "javascript: със скоби дава точно „<p>x</p>“",
    () => {
      assert.equal(markdownToHtml("[x](javascript:alert(1))"), "<p>x</p>");
    },
  );

  test("протокол-относителен адрес (//host, /\\host) не минава за вътрешна връзка", () => {
    assert.equal(markdownToHtml("[x](//evil.example)"), "<p>x</p>");
    assert.equal(markdownToHtml("[x](/\\evil.example)"), "<p>x</p>");
    assert.equal(markdownToHtml("[x](/novini)"), '<p><a href="/novini">x</a></p>');
  });

  test("адрес с едно ниво скоби се пази цял", () => {
    assert.equal(
      markdownToHtml("[Миньор](https://bg.wikipedia.org/wiki/Миньор_(Бобов_дол))"),
      '<p><a href="https://bg.wikipedia.org/wiki/Миньор_(Бобов_дол)" target="_blank" rel="noopener noreferrer">Миньор</a></p>',
    );
  });

  test("курсив и удебеляване в текста на връзката остават; знак за слот във входа не подменя връзка", () => {
    assert.equal(markdownToHtml("[**важно**](/a)"), '<p><a href="/a"><strong>важно</strong></a></p>');
    assert.equal(markdownToHtml("a \u00000\u0000 b [x](/c)"), '<p>a 0 b <a href="/c">x</a></p>');
  });
});

describe("markdownToHtml: блокове и инлайн форматиране", () => {
  test("заглавия ## ### #### стават h2–h4; ##### остава абзац", () => {
    assert.equal(
      markdownToHtml("## Две\n### Три\n#### Четири"),
      "<h2>Две</h2>\n<h3>Три</h3>\n<h4>Четири</h4>",
    );
    assert.equal(markdownToHtml("##### Пет"), "<p>##### Пет</p>");
  });

  test("ненареден списък", () => {
    assert.equal(markdownToHtml("- а\n- б"), "<ul>\n<li>а</li>\n<li>б</li>\n</ul>");
  });

  test("нареден списък", () => {
    assert.equal(markdownToHtml("1. а\n2. б"), "<ol>\n<li>а</li>\n<li>б</li>\n</ol>");
  });

  test("смяна на типа списък затваря предишния", () => {
    assert.equal(
      markdownToHtml("- а\n1. б"),
      "<ul>\n<li>а</li>\n</ul>\n<ol>\n<li>б</li>\n</ol>",
    );
  });

  test("цитат", () => {
    assert.equal(markdownToHtml("> Една мисъл"), "<blockquote>Една мисъл</blockquote>");
  });

  test("удебеляване и курсив", () => {
    assert.equal(
      markdownToHtml("**дебело** и *наклонено*"),
      "<p><strong>дебело</strong> и <em>наклонено</em></p>",
    );
  });

  test("последователни редове се слепват в един абзац; празен ред разделя", () => {
    assert.equal(markdownToHtml("а\nб\n\nв"), "<p>а б</p>\n<p>в</p>");
  });

  test("CRLF се нормализира", () => {
    assert.equal(markdownToHtml("а\r\nб\r\n\r\nв"), "<p>а б</p>\n<p>в</p>");
  });

  test("празен ред затваря списъка", () => {
    assert.equal(markdownToHtml("- а\n\nтекст"), "<ul>\n<li>а</li>\n</ul>\n<p>текст</p>");
  });
});

describe("markdownToHtml: празен вход", () => {
  test("празен низ → празен резултат", () => {
    assert.equal(markdownToHtml(""), "");
  });

  test("само интервали и нови редове → празен резултат", () => {
    assert.equal(markdownToHtml("  \n\n \t\n"), "");
  });

  test("null и undefined не хвърлят и дават празен резултат", () => {
    assert.equal(markdownToHtml(null as unknown as string), "");
    assert.equal(markdownToHtml(undefined as unknown as string), "");
  });
});
