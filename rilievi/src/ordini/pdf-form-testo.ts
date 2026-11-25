import {
  PDFHexString,
  PDFName,
  PDFString,
  type PDFField,
  type PDFFont,
  type PDFForm,
  type PDFTextField,
} from 'pdf-lib';
import type { AcroField } from './moduli.js';
import { fitBlock, fitLine } from './pdf-testo.js';

/**
 * Текстовите полета на формуляр (MoviLift, DMG, GEAT): стойността с нашия шрифт, в размер и редове, които
 * влизат в кутийката ѝ. Написаното не бива да се реже от кутийката (собственикът, 13 ноември 2026 — датата
 * на листа на DMG излезе срязана наполовина: „Искам да бъде перфектен“): едноредовото поле е един ред в
 * средата, каквото и да казва флагът на автора, а в поле за няколко реда редовете се мерят със стъпката, с
 * която pdf-lib ги реди.
 */

/**
 * Най-ниската кутийка, в която влизат два реда (при 5 pt). По-ниската е един ред, и когато авторът я е
 * отбелязал като многоредова („Data“ на QF Fixtures е висока 11 pt): pdf-lib реди многоредовото от горния
 * ръб надолу и редът пада под долния ръб.
 */
const DUE_RIGHE = 18;

/** Опашките под реда („g“, „p“, запетаята) като част от размера на шрифта — у DejaVu Sans са 0,21. */
const CODA = 0.25;

/**
 * Височината, която `righe` реда заемат в многоредово поле: pdf-lib ги реди от горния ръб надолу със стъпка
 * 1,2 × височината на шрифта (`layoutMultilineText`), а под последния ред са опашките. Мерено с друга
 * стъпка, последните редове на дълга бележка падаха под кутийката и се режеха.
 */
const altoNelCampo =
  (font: PDFFont) =>
  (righe: number, size: number): number =>
    righe * font.heightAtSize(size) * 1.2 + size * CODA;

/**
 * DA (шрифт, размер и цвят на полето) с „/“, записано като „\057“ — така го пише pypdf (MoviLift без
 * шифъра). pdf-lib търси шрифта по буквално „/“, затова низът се записва декодиран: в полето и в
 * бутоните му. Само низ без скоби и „\“ — неговият буквален запис е самият той.
 */
export function decodificaDa(field: PDFField): void {
  for (const dict of [field.acroField.dict, ...field.acroField.getWidgets().map((w) => w.dict)]) {
    const da = dict.lookup(PDFName.of('DA'));
    if (!(da instanceof PDFString) && !(da instanceof PDFHexString)) continue;
    const text = da.decodeText();
    if (text !== da.asString() && !/[()\\]/.test(text)) {
      dict.set(PDFName.of('DA'), PDFString.of(text));
    }
  }
}

/**
 * Само собственият бутон на полето (`widget` в картата): бутонът му на чуждо място („Fossa“ на MoviLift
 * е и в кутийка на „Piano Corto“) се маха от листа — иначе стойността излиза и там.
 */
function soloProprioWidget(form: PDFForm, textField: PDFTextField, keep: number): void {
  const widgets = textField.acroField.getWidgets();
  for (let i = widgets.length - 1; i >= 0; i -= 1) {
    if (i === keep) continue;
    const ref = form.doc.context.getObjectRef(widgets[i]!.dict);
    textField.acroField.removeWidget(i);
    if (!ref) continue;
    for (const page of form.doc.getPages()) page.node.removeAnnot(ref);
    form.doc.context.delete(ref);
  }
}

export function fillText(
  form: PDFForm,
  field: Extract<AcroField, { kind: 'text' | 'textarea' }>,
  value: unknown,
  font: PDFFont,
): void {
  const textField = form.getTextField(field.acro);
  if ('widget' in field && field.widget !== undefined) {
    soloProprioWidget(form, textField, field.widget);
  }
  decodificaDa(textField);
  if (typeof value !== 'string' || !value) {
    // Празното си остава празно; ред с текст от празния модул („-“), махнат от човека, се изчиства.
    if (textField.getText()) {
      textField.setText('');
      textField.updateAppearances(font);
    }
    return;
  }
  const widgets = textField.acroField.getWidgets();
  for (const widget of widgets) {
    // Модулът е без рамка (/BC празно); pdf-lib би очертал полето в черно — дебелината става 0.
    if (!widget.getAppearanceCharacteristics()?.getBorderColor()?.length) {
      widget.getBorderStyle()?.setWidth(0);
    }
  }
  // Полето с няколко бутона (главата на DMG се повтаря на страниците) се мери по най-тясното си място.
  const rects = widgets.map((w) => w.getRectangle());
  const larghezza = rects.length ? Math.min(...rects.map((r) => r.width)) : 100;
  const altezza = rects.length ? Math.min(...rects.map((r) => r.height)) : 14;
  const bordo = Math.max(0, ...widgets.map((w) => w.getBorderStyle()?.getWidth() ?? 0));
  // Вътре в кутийката, както я смята pdf-lib (рамката и 1 pt отстъп от всяка страна), и още 1 pt въздух.
  const width = larghezza - (bordo + 1) * 2 - 2;
  // Шрифтът — до 10 pt и до ¾ от височината на реда (квадратчетата на MoviLift са високи 11 pt).
  const max = Math.min(10, Math.max(6, altezza * 0.75));
  // Блок: бележка, или поле на автора за няколко реда, в което два реда наистина влизат.
  const blocco = field.kind === 'textarea' || (textField.isMultiline() && altezza >= DUE_RIGHE);
  if (blocco) {
    if (!textField.isMultiline()) textField.enableMultiline();
    // Вътрешността на кутийката, както я смята pdf-lib: рамката и 1 pt отстъп от всяка страна.
    const dentro = altezza - (bordo + 1) * 2;
    const block = fitBlock(font, value, width - 4, dentro, max, altoNelCampo(font));
    textField.setFontSize(block.size);
    textField.setText(block.lines.join('\n'));
  } else {
    if (textField.isMultiline()) textField.disableMultiline();
    const fit = fitLine(font, value, width, max);
    textField.setFontSize(fit.size);
    textField.setText(fit.text);
  }
  textField.updateAppearances(font);
}
