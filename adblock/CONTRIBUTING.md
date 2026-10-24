# Contributing translations to Supreme AdBlock

Supreme AdBlock speaks 70 languages (73 locale folders). Most of them were translated with
machine help and checked by us, so a native speaker's fix is the most useful contribution
there is. Thank you.

## What you can change

- **The extension's interface:** `adblock/_locales/<code>/messages.json` — only the
  `"message"` values. `<code>` is the folder name (`fr`, `pt_BR`, `zh_TW`, …).
- That is all a translation pull request should touch. The store descriptions
  (`adblock/docs/listing/*.txt`) and the website are edited by the maintainers, because the
  stores review every word of them: tell us in the pull request if one of them is wrong.

## Rules the tests enforce

Run `npm test` in `adblock/` before you open the pull request (Node 20 or newer, nothing to
install). `tests/i18n.test.mjs` fails when one of these is broken:

- Every key of `_locales/en/messages.json` exists in your file, and no other key.
- Placeholders stay exactly as they are: `$1`, `$2` and `$NAME$` appear as many times as in
  English (the browser fills them in — a host name, a number).
- No markup and no links of your own: no `<b>`, no `<a>`, no new web address. The only
  addresses allowed are the examples the English text already has (`https://…/list.txt`).
- **The brand is never translated:** `extName` stays `Supreme AdBlock` (English, Bulgarian,
  German and Italian carry one generic word after it; leave those as they are).
- `extDescription` (the store summary) is at most 132 characters.

## Tone

Match what is already in your language's file: the same form of address (formal or
informal), the same word for "site", "block", "allow" and "Settings", the same quotation
marks. Short labels (buttons, the popup) must stay short: the popup is 320 px wide and 600 px
high, in every language.

## Opening the pull request

1. Fork the repository and edit `adblock/_locales/<code>/messages.json`.
2. `cd adblock && npm test` — every line must say PASS.
3. Open the pull request with the language in the title ("Translation: Polish — …") and, if
   you can, a sentence on what was wrong (a wrong term, a wrong meaning, grammar).

We read every pull request. By contributing you agree that your translation is published
under the extension's MIT licence. Questions: info@carbonstealth.eu.
