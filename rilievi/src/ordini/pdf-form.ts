import {
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
  type PDFDocument,
  type PDFField,
  type PDFFont,
  type PDFForm,
  type PDFTextField,
} from 'pdf-lib';
import { fieldsOf, type AcroField, type ModuloAcro } from './moduli.js';
import { apriModulo, fitBlock, fitLine } from './pdf-testo.js';
import type { Valori } from './valori.js';

/**
 * Формулярите (Montanari, MoviLift): полетата се попълват по име и формулярът се „заключва“
 * (flatten). Всяко поле от картата получава нашата стойност — и празно, и „без отметка“: празният
 * модул на MoviLift има отметки и избори по подразбиране, а махнатото от човека не бива да остане на
 * листа.
 */

/** Радио група: бутонът на избраната опция (по реда му в PDF-а), всички други — изключени. */
function selectRadio(form: PDFForm, field: Extract<AcroField, { kind: 'radio' }>, value: unknown) {
  const group = form.getRadioGroup(field.acro);
  const widgets = group.acroField.getWidgets();
  const chosen = field.opzioni.find((o) => o.valore === value);
  const on = chosen ? widgets[chosen.widget]?.getOnValue() : undefined;
  // Имената на състоянията са каквито ги е направил авторът („0“, „Sì“, „7“) — взимат се от бутона.
  group.acroField.dict.set(PDFName.of('V'), on ?? PDFName.of('Off'));
  widgets.forEach((widget, i) => {
    const own = widget.getOnValue();
    widget.setAppearanceState(chosen && i === chosen.widget && own ? own : PDFName.of('Off'));
  });
}

/**
 * DA (шрифт, размер и цвят на полето) с „/“, записано като „\057“ — така го пише pypdf (MoviLift без
 * шифъра). pdf-lib търси шрифта по буквално „/“, затова низът се записва декодиран: в полето и в
 * бутоните му. Само низ без скоби и „\“ — неговият буквален запис е самият той.
 */
function decodificaDa(field: PDFField): void {
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

function fillText(
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
  const rect = widgets[0]?.getRectangle();
  const width = (rect?.width ?? 100) - 4;
  // Шрифтът — до 10 pt и до ¾ от височината на реда (квадратчетата на MoviLift са високи 11 pt).
  const max = Math.min(10, Math.max(6, (rect?.height ?? 14) * 0.75));
  if (field.kind === 'textarea') {
    const block = fitBlock(font, value, width - 4, (rect?.height ?? 40) - 4, max);
    textField.setFontSize(block.size);
    textField.setText(block.lines.join('\n'));
  } else {
    const fit = fitLine(font, value, width, max);
    textField.setFontSize(fit.size);
    textField.setText(fit.text);
  }
  textField.updateAppearances(font);
}

/** Всяко поле на формуляра от картата получава нашата стойност (без заключване — то е после). */
export function compilaAcroform(
  form: PDFForm,
  modulo: ModuloAcro,
  valori: Valori,
  font: PDFFont,
): void {
  for (const field of fieldsOf(modulo)) {
    if (!('acro' in field)) continue;
    const value = valori[field.key];
    switch (field.kind) {
      case 'check': {
        const box = form.getCheckBox(field.acro);
        if (value === true) box.check();
        else if (box.isChecked()) box.uncheck();
        break;
      }
      case 'radio':
        selectRadio(form, field, value);
        break;
      case 'select': {
        const dropdown = form.getDropdown(field.acro);
        const choice = typeof value === 'string' && field.opzioni.includes(value) ? value : null;
        // Без избор — опцията „нищо“ на модула („SCEGLI...“), както е на празния лист.
        if ((dropdown.getSelected()[0] ?? '') !== (choice ?? field.vuoto)) {
          decodificaDa(dropdown);
          dropdown.select(choice ?? field.vuoto);
          dropdown.updateAppearances(font);
        }
        break;
      }
      default:
        fillText(form, field, value, font);
    }
  }
}

/**
 * pdf-lib при flatten трие бутоните на поле с повече от един бутон (радио групите, двойните редове на
 * MoviLift), но оставя връзките към тях в /Annots на страницата — четците ги отчитат като повреда
 * („Invalid XRef entry“, „грешка на страницата“). Махат се връзките към изтрито.
 */
function pulisciAnnots(doc: PDFDocument): void {
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const live = annots
      .asArray()
      .filter((item) => !(item instanceof PDFRef) || doc.context.lookup(item) !== undefined);
    if (live.length === annots.size()) continue;
    if (live.length > 0) page.node.set(PDFName.of('Annots'), doc.context.obj(live));
    else page.node.delete(PDFName.of('Annots'));
  }
}

export async function renderAcroform(
  modulo: ModuloAcro,
  valori: Valori,
  fontDir: string,
): Promise<Uint8Array> {
  const { doc, font } = await apriModulo(modulo, fontDir);
  const form = doc.getForm();
  compilaAcroform(form, modulo, valori, font);
  // Пипнатите полета са с нов облик; останалото (празните полета, бутонът) остава оригинално.
  form.flatten({ updateFieldAppearances: false });
  pulisciAnnots(doc);
  return doc.save();
}
