'use client';

import { useState } from 'react';
import { blockFieldInput, blockFieldLabels, blockFieldsFor, type BlockFieldLabel } from '@/lib/blocks';

const field = 'mt-1 w-full rounded-control border border-line-input px-3 py-2';

/**
 * Вид блок + полетата, които той ползва, с етикет по вида (за „Музика“ първото поле е
 * Spotify, второто Apple Music — както ги чете parseBlockInput). Без JavaScript остават
 * полетата на „Линк“ (подразбирането).
 */
export function AddBlockFields({
  kinds,
  kindLabel,
  kindLabels,
  fieldLabels,
  hints,
  titleLabel,
  optionsLabel,
  optionsPlaceholder,
  optionsHint,
}: {
  kinds: readonly string[];
  kindLabel: string;
  kindLabels: Record<string, string>;
  fieldLabels: Record<BlockFieldLabel, string>;
  hints: Record<string, string>;
  titleLabel: string;
  optionsLabel: string;
  optionsPlaceholder: string;
  optionsHint: string;
}) {
  const [kind, setKind] = useState('LINK');
  const shows = blockFieldsFor(kind);
  const labels = blockFieldLabels(kind);
  const input = (name: 'url' | 'extra1' | 'extra2') => {
    const label = labels[name];
    if (!label) return null;
    const spec = blockFieldInput(label);
    return (
      <label key={`${kind}-${name}`} className="block text-sm font-medium">
        {fieldLabels[label]}
        <input
          type={spec.type}
          name={name}
          required={spec.required}
          placeholder={spec.placeholder}
          autoComplete="off"
          className={field}
        />
      </label>
    );
  };

  return (
    <>
      <label className="block text-sm font-medium">
        {kindLabel}
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {titleLabel}
        <input type="text" name="title" required maxLength={100} className={field} />
      </label>
      {input('url')}
      {input('extra1')}
      {input('extra2')}
      {shows.options && (
        <label className="block text-sm font-medium sm:col-span-2">
          {optionsLabel}
          <textarea name="options" rows={3} required placeholder={optionsPlaceholder} className={field} />
          <span className="mt-1 block text-xs font-normal text-fg-muted">{optionsHint}</span>
        </label>
      )}
      {hints[kind] && <p className="text-xs text-fg-muted sm:col-span-2">{hints[kind]}</p>}
    </>
  );
}
