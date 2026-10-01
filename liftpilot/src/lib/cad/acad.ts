// acad-ts, with the names of its classes restored. The library finds the DXF metadata of an object by its class
// name (DxfClassMap, table templates); a minified bundle renames classes (e.g. Block → "db") and breaks reading and
// writing. The export names survive minification (the namespace is read dynamically here), so each exported class
// gets its own name back once, before any use. On the server the package is not bundled at all (next.config.mjs).
import * as acad from '@node-projects/acad-ts';

for (const [name, value] of Object.entries(acad)) {
  if (typeof value === 'function' && value.name !== name) Object.defineProperty(value, 'name', { value: name, configurable: true });
}

export { acad };
