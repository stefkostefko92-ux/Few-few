import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRadioGroup,
  PDFRawStream,
  PDFRef,
  type PDFDocument,
  type PDFFont,
  type PDFForm,
  type PDFWidgetAnnotation,
} from 'pdf-lib';
import { fieldsOf, type AcroField, type ModuloAcro } from './moduli.js';
import {
  campiVisibili,
  pulisciFormulario,
  togliOrfani,
  togliSenzaAspetto,
} from './pdf-form-pulizia.js';
import { decodificaDa, fillText } from './pdf-form-testo.js';
import { togliLivelliSpenti } from './pdf-livelli.js';
import { apriModulo, SEGNO } from './pdf-testo.js';
import type { Valori } from './valori.js';

/**
 * Формулярът на MoviLift: полетата се попълват по име и формулярът се „заключва“
 * (flatten). Всяко поле от картата получава нашата стойност — и празно, и „без отметка“: празният
 * модул на MoviLift има отметки и избори по подразбиране, а махнатото от човека не бива да остане на
 * листа.
 */

const n = (value: number): string => value.toFixed(2);

/**
 * Обликът „включено“ на кутийка или радио бутон: рамката от облика „изключено“ на автора и отгоре нашият
 * знак с линии — плътна отметка (✔) или квадратче (■). Авторът пише знака с невградения ZapfDingbats —
 * тънък, а където шрифтът липсва, не излиза нищо (собственикът, 21 октомври 2026: по-ясни отметки).
 */
function segnoMarcato(form: PDFForm, widget: PDFWidgetAnnotation, forma: 'spunta' | 'quadrato') {
  const on = widget.getOnValue();
  const states = widget.dict.lookupMaybe(PDFName.of('AP'), PDFDict);
  const normal = states?.lookupMaybe(PDFName.of('N'), PDFDict);
  // Рамката е обликът „изключено“; DMG я рисува в страницата и бутонът няма такъв — само знакът ни.
  const base = normal?.lookup(PDFName.of('Off')) ?? (on ? normal?.lookup(on) : undefined);
  const off = base instanceof PDFRawStream ? base : null;
  const bbox = off?.dict.lookupMaybe(PDFName.of('BBox'), PDFArray);
  if (!on || !normal || !off || !bbox) return;
  const { x, y, width, height } = bbox.asRectangle();
  const side = Math.min(width, height);
  const [cx, cy] = [x + width / 2, y + height / 2];
  const segno =
    forma === 'spunta'
      ? `0 G ${n(Math.max(SEGNO, side * 0.13))} w 1 J 1 j ` +
        `${n(cx - side * 0.36)} ${n(cy)} m ${n(cx - side * 0.1)} ${n(cy - side * 0.26)} l ` +
        `${n(cx + side * 0.36)} ${n(cy + side * 0.28)} l S`
      : `0 g ${n(cx - side * 0.21)} ${n(cy - side * 0.21)} ${n(side * 0.42)} ${n(side * 0.42)} re f`;
  const cornice = normal.has(PDFName.of('Off'))
    ? Buffer.from(decodePDFRawStream(off).decode()).toString('latin1')
    : '';
  const matrix = off.dict.get(PDFName.of('Matrix'));
  const stream = form.doc.context.flateStream(`${cornice}\nq\n${segno}\nQ\n`, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [x, y, x + width, y + height],
    ...(matrix ? { Matrix: matrix } : {}),
  });
  normal.set(on, form.doc.context.register(stream));
}

/**
 * Избор от няколко бутона: радио група (опцията сочи бутона по реда му в PDF-а) или група отметки с едно
 * име (DMG — опцията сочи бутона по името на „включеното“ му състояние). Включва се бутонът на избраното,
 * всички други — изключени. Избор без поле в PDF-а (моделът на бутониерите на DMG) не пише нищо.
 */
function selectRadio(form: PDFForm, field: Extract<AcroField, { kind: 'radio' }>, value: unknown) {
  if (field.acro === undefined) return;
  const target = form.getField(field.acro);
  const widgets = target.acroField.getWidgets();
  const chosen = field.opzioni.find((o) => o.valore === value);
  const scelto = (widget: PDFWidgetAnnotation, i: number): boolean =>
    chosen !== undefined &&
    (chosen.widget !== undefined
      ? i === chosen.widget
      : widget.getOnValue()?.decodeText() === chosen.stato);
  const index = widgets.findIndex(scelto);
  const on = index >= 0 ? widgets[index]!.getOnValue() : undefined;
  // Имената на състоянията са каквито ги е направил авторът („0“, „Sì“, „Geared“) — взимат се от бутона.
  target.acroField.dict.set(PDFName.of('V'), on ?? PDFName.of('Off'));
  const forma = target instanceof PDFRadioGroup ? 'quadrato' : 'spunta';
  widgets.forEach((widget, i) => {
    const own = widget.getOnValue();
    const selected = own !== undefined && scelto(widget, i);
    widget.setAppearanceState(selected ? own : PDFName.of('Off'));
    if (selected) segnoMarcato(form, widget, forma);
  });
}

/**
 * Полетата, които формулярът няма, а листът чака (`crea` в картата: напрежението на фотоклетката на
 * MoviLift пред отпечатаното „V“): ново текстово поле без рамка и фон, на страницата на образеца си и с
 * неговия вид (DA) — после се попълва като всяко друго.
 */
function creaCampi(form: PDFForm, modulo: ModuloAcro, font: PDFFont): void {
  for (const field of fieldsOf(modulo)) {
    if (!('crea' in field) || !field.crea || form.getFieldMaybe(field.acro)) continue;
    const come = form.getTextField(field.crea.come).acroField;
    const pageRef = come.getWidgets()[0]?.P();
    const page = form.doc.getPages().find((p) => p.ref === pageRef);
    if (!page) throw new Error(`${modulo.id}: ${field.crea.come} е без страница`);
    const created = form.createTextField(field.acro);
    const da = come.getDefaultAppearance();
    if (da) created.acroField.setDefaultAppearance(da);
    const [x, y, width, height] = field.crea.rect;
    created.addToPage(page, {
      x,
      y,
      width,
      height,
      font,
      textColor: undefined,
      backgroundColor: undefined,
      borderColor: undefined,
      borderWidth: 0,
    });
  }
}

/** Всяко поле на формуляра от картата получава нашата стойност (без заключване — то е после). */
export function compilaAcroform(
  form: PDFForm,
  modulo: ModuloAcro,
  valori: Valori,
  font: PDFFont,
): void {
  creaCampi(form, modulo, font);
  for (const field of fieldsOf(modulo)) {
    if (!('acro' in field)) continue;
    const value = valori[field.key];
    switch (field.kind) {
      case 'check': {
        const box = form.getCheckBox(field.acro);
        if (value === true) {
          box.check();
          for (const widget of box.acroField.getWidgets()) segnoMarcato(form, widget, 'spunta');
        } else if (box.isChecked()) box.uncheck();
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
  // Един език на листа за всеки четец и принтер: изключените слоеве (DMG) излизат от страниците.
  const livelli = togliLivelliSpenti(doc);
  const form = doc.getForm();
  compilaAcroform(form, modulo, valori, font);
  if (modulo.pulizia) pulisciFormulario(form, modulo, campiVisibili(modulo, valori));
  togliSenzaAspetto(form);
  // Пипнатите полета са с нов облик; останалото (празните полета, бутонът) остава оригинално.
  form.flatten({ updateFieldAppearances: false });
  pulisciAnnots(doc);
  if (modulo.pulizia || livelli) togliOrfani(doc);
  return doc.save();
}
