// When the server refuses a save because the project was saved elsewhere (409), what is on screen is not lost: it
// becomes a new project, named as „Duplicate“ in the project list names a copy („ (2)“), and is saved there; the
// editor then opens it. Both requests are the ones the pages make (the form for a new project, the editor's save).
const NAME_MAX = 80;
const SUFFIX = ' (2)';

export const copyName = (name) => `${name.slice(0, NAME_MAX - SUFFIX.length).trimEnd()}${SUFFIX}`;

// the boot data of an editor page (its <script type="application/json" id="boot">)
function bootOf(html) {
  const json = /<script type="application\/json" id="boot">([\s\S]*?)<\/script>/.exec(html)?.[1];
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// The address of the new project's editor, or null when the server refused it (the cap on projects, an ended plan).
export async function saveAsCopy({ spec, name, csrf }) {
  const copy = copyName(name);
  const created = await fetch('/app/projects', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, type: String(spec.type), name: copy }).toString(),
  });
  // the server answers with the new project's editor (a followed redirect); a refusal leads back to the list
  const id = /^\/app\/p\/([^/?#]+)$/.exec(new URL(created.url).pathname)?.[1];
  const base = created.ok && id ? bootOf(await created.text())?.updatedAt : null;
  if (!base) return null;
  const saved = await fetch(`/app/api/projects/${id}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      accept: 'application/json',
    },
    body: JSON.stringify({ spec, name: copy, base }),
  });
  return saved.ok ? `/app/p/${id}` : null;
}
