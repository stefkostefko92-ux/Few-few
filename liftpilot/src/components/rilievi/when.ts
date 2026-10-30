// The attributes of a condition (rilievi _when.ejs, commit 988f3cf37), one source for every place the sheet's form puts
// one: a field's wrapper, a section, its line in the index beside the form, its tick among the sections to print.
// `data-when` is the field it depends on, `data-when-values` its answers that show it, `data-when-not` — shown while the
// field has none of them («Argano»: not with a hydraulic lift); `off` — hidden at the opening (the server's values). The
// page shows and hides them afterwards as the answers change (form-dom.ts syncConditions). No condition — no attributes.
import type { Condition } from '@/lib/rilievi/field-types';

export interface WhenAttrs {
  'data-when'?: string;
  'data-when-values'?: string;
  'data-when-not'?: '';
  'data-off'?: '';
}

export function whenAttrs(when: Condition | undefined, off: boolean): WhenAttrs {
  if (!when) return {};
  return {
    'data-when': when.field,
    'data-when-values': when.values.join(' '),
    'data-when-not': when.not ? '' : undefined,
    'data-off': off ? '' : undefined,
  };
}
