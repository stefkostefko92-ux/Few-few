import 'server-only';
// MoviLift's form: the fields are filled by name and the form is locked (flatten). Every field of the map gets our value —
// the empty one and the unticked too: MoviLift's blank module has ticks and choices by default, and what the person
// removed must not stay on the sheet. Ported 1:1 from rilievi (src/ordini/pdf-form.ts, commit ae6329cb6).
import { PDFHexString, PDFName, PDFRef, PDFString, type PDFDocument, type PDFField, type PDFFont, type PDFForm, type PDFTextField } from 'pdf-lib';
import { fieldsOf, type AcroField, type ModuloAcro } from '@/lib/rilievi/ordini/moduli';
import type { Valori } from '@/lib/rilievi/ordini/valori';
import { apriModulo, fitBlock, fitLine } from './pdf-testo';

/** A radio group: the button of the chosen option (by its order in the PDF), every other — off. */
function selectRadio(form: PDFForm, field: Extract<AcroField, { kind: 'radio' }>, value: unknown): void {
  const group = form.getRadioGroup(field.acro);
  const widgets = group.acroField.getWidgets();
  const chosen = field.opzioni.find((o) => o.valore === value);
  const on = chosen ? widgets[chosen.widget]?.getOnValue() : undefined;
  // the states' names are whatever the author made them («0», «Sì», «7») — taken from the button
  group.acroField.dict.set(PDFName.of('V'), on ?? PDFName.of('Off'));
  widgets.forEach((widget, i) => {
    const own = widget.getOnValue();
    widget.setAppearanceState(chosen && i === chosen.widget && own ? own : PDFName.of('Off'));
  });
}

/**
 * DA (the field's font, size and colour) with «/» written as «\057» — so pypdf writes it (MoviLift without the
 * encryption). pdf-lib looks for the font by a literal «/», so the string is written decoded: in the field and in its
 * buttons. Only a string without brackets and «\» — its literal form is itself.
 */
function decodificaDa(field: PDFField): void {
  for (const dict of [field.acroField.dict, ...field.acroField.getWidgets().map((w) => w.dict)]) {
    const da = dict.lookup(PDFName.of('DA'));
    if (!(da instanceof PDFString) && !(da instanceof PDFHexString)) continue;
    const text = da.decodeText();
    if (text !== da.asString() && !/[()\\]/.test(text)) dict.set(PDFName.of('DA'), PDFString.of(text));
  }
}

/**
 * Only the field's own button (`widget` in the map): its button in a foreign place (MoviLift's «Fossa» is also in a box
 * of «Piano Corto») goes off the sheet — otherwise the value comes out there too.
 */
function soloProprioWidget(form: PDFForm, textField: PDFTextField, keep: number): void {
  const widgets = textField.acroField.getWidgets();
  for (let i = widgets.length - 1; i >= 0; i -= 1) {
    if (i === keep) continue;
    const widget = widgets[i];
    const ref = widget ? form.doc.context.getObjectRef(widget.dict) : undefined;
    textField.acroField.removeWidget(i);
    if (!ref) continue;
    for (const page of form.doc.getPages()) page.node.removeAnnot(ref);
    form.doc.context.delete(ref);
  }
}

function fillText(form: PDFForm, field: Extract<AcroField, { kind: 'text' | 'textarea' }>, value: unknown, font: PDFFont): void {
  const textField = form.getTextField(field.acro);
  if ('widget' in field && field.widget !== undefined) soloProprioWidget(form, textField, field.widget);
  decodificaDa(textField);
  if (typeof value !== 'string' || !value) {
    // the empty stays empty; a line with the blank module's text («-») the person removed is cleared
    if (textField.getText()) {
      textField.setText('');
      textField.updateAppearances(font);
    }
    return;
  }
  const widgets = textField.acroField.getWidgets();
  for (const widget of widgets) {
    // the module has no border (/BC empty); pdf-lib would outline the field in black — its width becomes 0
    if (!widget.getAppearanceCharacteristics()?.getBorderColor()?.length) widget.getBorderStyle()?.setWidth(0);
  }
  const rect = widgets[0]?.getRectangle();
  const width = (rect?.width ?? 100) - 4;
  // the type — up to 10 pt and up to ¾ of the line's height (MoviLift's squares are 11 pt high)
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

/** Every field of the map gets our value (without locking — that comes after). */
export function compilaAcroform(form: PDFForm, modulo: ModuloAcro, valori: Valori, font: PDFFont): void {
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
        // without a choice — the module's "nothing" option («SCEGLI...»), as on the blank sheet
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
 * pdf-lib's flatten deletes the buttons of a field with more than one (the radio groups, MoviLift's double lines), but
 * leaves the links to them in the page's /Annots — the readers take them for damage («Invalid XRef entry»). The links to
 * what is deleted go.
 */
function pulisciAnnots(doc: PDFDocument): void {
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const live = annots.asArray().filter((item) => !(item instanceof PDFRef) || doc.context.lookup(item) !== undefined);
    if (live.length === annots.size()) continue;
    if (live.length > 0) page.node.set(PDFName.of('Annots'), doc.context.obj(live));
    else page.node.delete(PDFName.of('Annots'));
  }
}

export async function renderAcroform(modulo: ModuloAcro, valori: Valori, fontDir: string): Promise<Uint8Array> {
  const { doc, font } = await apriModulo(modulo, fontDir);
  const form = doc.getForm();
  compilaAcroform(form, modulo, valori, font);
  // the touched fields have a new appearance; the rest (the empty fields, the button) stays original
  form.flatten({ updateFieldAppearances: false });
  pulisciAnnots(doc);
  return doc.save();
}
