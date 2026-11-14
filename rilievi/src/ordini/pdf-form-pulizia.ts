import {
  AnnotationFlags,
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFName,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
  type PDFField,
  type PDFForm,
  type PDFWidgetAnnotation,
} from 'pdf-lib';
import { fieldsOf, type ModuloAcro } from './moduli.js';
import type { Valori } from './valori.js';

/**
 * Почистването на формуляр с логика в JavaScript (DMG, `pulizia` в картата) преди „заключването“. Авторът
 * крие полета и ги показва от JavaScript (енкодерите при затворен контур, картинките на модела, корицата
 * на Fixtures), а pdf-lib при flatten рисува всяко поле, и скритото. Затова: JavaScript-ът се маха (листът е
 * готов, нищо не бива да се изпълнява при отваряне), бутоните за действие (Salva, Invia, Reset, езиците,
 * стрелките, корицата) и полетата по `nonStampare` („кръпките“) не излизат, а скритото излиза само ако е
 * попълнено от нас или показано от избран модел (`mostra`) — като в Acrobat след избора на човека.
 */

/** Полетата на PDF-а, които трябва да се виждат: попълнените и показаните от избраното. */
export function campiVisibili(modulo: ModuloAcro, valori: Valori): Set<string> {
  const out = new Set<string>();
  for (const field of fieldsOf(modulo)) {
    const value = valori[field.key];
    if (value === undefined || value === '') continue;
    if ('acro' in field && field.acro) out.add(field.acro);
    if (field.kind === 'radio') {
      const scelta = field.opzioni.find((o) => o.valore === value);
      for (const nome of scelta?.mostra ?? []) out.add(nome);
    }
  }
  return out;
}

/**
 * Бутонът се маха от всяка страница, без да се рисува. От файла — само отделният бутон: полето, което е
 * и свой бутон, остава в дървото на формуляра (празно — flatten го маха).
 */
function togliWidget(form: PDFForm, field: PDFField, widget: PDFWidgetAnnotation): void {
  const ref = form.doc.context.getObjectRef(widget.dict);
  if (!ref) return;
  for (const page of form.doc.getPages()) page.node.removeAnnot(ref);
  if (widget.dict !== field.acroField.dict) form.doc.context.delete(ref);
}

/** Бутонът с номер `i` на полето — от страниците и от полето. */
function togliWidgetN(form: PDFForm, field: PDFField, i: number): void {
  togliWidget(form, field, field.acroField.getWidgets()[i]!);
  field.acroField.removeWidget(i);
}

/** Полето — с всичките му бутони — излиза от формуляра, от страниците и от файла, без да се рисува. */
function togliCampo(form: PDFForm, field: PDFField): void {
  const refs = field.acroField
    .getWidgets()
    .map((widget) => form.doc.context.getObjectRef(widget.dict))
    .filter((ref): ref is PDFRef => ref !== undefined);
  form.acroForm.removeField(field.acroField);
  for (const ref of refs) {
    for (const page of form.doc.getPages()) page.node.removeAnnot(ref);
    form.doc.context.delete(ref);
  }
  form.doc.context.delete(field.ref);
}

const nascosto = (widget: PDFWidgetAnnotation): boolean =>
  (widget.getFlags() & AnnotationFlags.Hidden) !== 0;

/** JavaScript-ът на документа и на страниците: при отваряне, при печат, в имената. */
function togliJavaScript(doc: PDFDocument): void {
  const catalog = doc.catalog;
  catalog.delete(PDFName.of('OpenAction'));
  catalog.delete(PDFName.of('AA'));
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  names?.delete(PDFName.of('JavaScript'));
  for (const page of doc.getPages()) page.node.delete(PDFName.of('AA'));
}

export function pulisciFormulario(
  form: PDFForm,
  modulo: ModuloAcro,
  visibili: ReadonlySet<string>,
): void {
  const regole = modulo.pulizia?.nonStampare.map((source) => new RegExp(source)) ?? [];
  togliJavaScript(form.doc);
  for (const field of form.getFields()) {
    const name = field.getName();
    if (regole.some((re) => re.test(name))) {
      togliCampo(form, field);
      continue;
    }
    const widgets = field.acroField.getWidgets();
    // Попълненото и показаното от избора излиза — и картинка (бутон), щом изборът я показва.
    if (visibili.has(name)) {
      for (const widget of widgets) widget.setFlagTo(AnnotationFlags.Hidden, false);
      continue;
    }
    if (field instanceof PDFButton || widgets.every(nascosto)) {
      togliCampo(form, field);
      continue;
    }
    // Скрит бутон на видимо поле — само той излиза (отзад напред: номерата не се местят).
    for (let i = widgets.length - 1; i >= 0; i -= 1)
      if (nascosto(widgets[i]!)) togliWidgetN(form, field, i);
  }
}

/**
 * Обликът, който flatten на pdf-lib ще нарисува: на отметка — този на състоянието на полето или „Off“, на
 * всичко друго — самият облик (връзка към поток). Без него flatten спира с грешка.
 */
function haAspetto(field: PDFField, widget: PDFWidgetAnnotation): boolean {
  let normal: PDFRef | PDFDict;
  try {
    normal = widget.getNormalAppearance();
  } catch {
    return false;
  }
  if (
    normal instanceof PDFDict &&
    (field instanceof PDFCheckBox || field instanceof PDFRadioGroup)
  ) {
    const state = field.acroField.getValue();
    return (normal.get(state) ?? normal.get(PDFName.of('Off'))) instanceof PDFRef;
  }
  return normal instanceof PDFRef;
}

/**
 * Бутон без облик за състоянието си няма какво да остави на листа: DMG рисува кутийките в самата страница
 * и дава на бутона само облика „включено“ — невключените излизат, без да се рисуват (като в четеца).
 */
export function togliSenzaAspetto(form: PDFForm): void {
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    for (let i = widgets.length - 1; i >= 0; i -= 1)
      if (!haAspetto(field, widgets[i]!)) togliWidgetN(form, field, i);
  }
}

/**
 * Обектите, до които нищо не води (облиците и картинките на махнатите бутони — корицата, другите модели):
 * pdf-lib ги записва и така, а у DMG те са повечето от файла (Fixtures: 7 MB → 4,4 MB). Достижимото се
 * търси от корена на документа; всичко друго излиза.
 */
export function togliOrfani(doc: PDFDocument): void {
  const visti = new Set<PDFRef>();
  const pila: Array<PDFObject | undefined> = [
    doc.context.trailerInfo.Root,
    doc.context.trailerInfo.Info,
    doc.context.trailerInfo.Encrypt,
    doc.context.trailerInfo.ID,
  ];
  while (pila.length > 0) {
    const obj = pila.pop();
    if (obj instanceof PDFRef) {
      if (visti.has(obj)) continue;
      visti.add(obj);
      pila.push(doc.context.lookup(obj));
    } else if (obj instanceof PDFStream) pila.push(obj.dict);
    else if (obj instanceof PDFDict) for (const [, value] of obj.entries()) pila.push(value);
    else if (obj instanceof PDFArray) pila.push(...obj.asArray());
  }
  for (const [ref] of doc.context.enumerateIndirectObjects())
    if (!visti.has(ref)) doc.context.delete(ref);
}
