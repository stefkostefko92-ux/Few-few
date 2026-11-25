// Supreme AdBlock — the uBlock Origin list is switched off, so the entity data the
// manifest injected before the engine (scriptlets/ubo/entities.js) is dropped unread.
// Registered by the service worker only while that list is off; never on other pages.
try { delete document.__tbabScriptletEntities; } catch (e) {}
