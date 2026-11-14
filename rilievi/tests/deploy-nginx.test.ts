// The nginx vhost (deploy/nginx/rilievi.carbonstealth.eu.conf, audit of 12 November 2026): the static
// maintenance page instead of a bare 502 while the app restarts — its strict CSP allows exactly the hash of
// its own <style>, so an edit of the page without the new hash would show it unstyled; nothing external is
// loaded; the PDF check and the company export have their own limits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dir = join(import.meta.dirname, '..', 'deploy', 'nginx');
const conf = readFileSync(join(dir, 'rilievi.carbonstealth.eu.conf'), 'utf8');
const page = readFileSync(join(dir, 'manutenzione.html'), 'utf8');

describe('the nginx vhost', () => {
  it('serves the maintenance page with a CSP that matches its style', () => {
    assert.match(conf, /error_page 502 503 504 \/manutenzione\.html;/);
    const style = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1];
    assert.ok(style, 'the page has its style inline');
    const hash = createHash('sha256').update(style, 'utf8').digest('base64');
    assert.ok(conf.includes(`style-src 'sha256-${hash}'`), `the CSP carries sha256-${hash}`);
    assert.match(conf, /add_header Retry-After \d+ always;/);
  });

  it('keeps the maintenance page self-contained and in Italian', () => {
    assert.match(page, /<html lang="it">/);
    assert.doesNotMatch(page, /(src|href)=|url\(|@import|<script/i);
  });

  it('lets the PDF check through up to its 25 MB and streams the export', () => {
    assert.match(conf, /location = \/master\/verifica \{[^}]*client_max_body_size 26m;/);
    const exportBlock =
      /location ~ \^\/\(aziende\/\[a-z0-9\]\+\/esporta\|impostazioni\/esportazione\/scarica\)\$ \{([^}]*)\}/.exec(
        conf,
      )?.[1];
    assert.ok(exportBlock, 'the export has its own location');
    assert.match(exportBlock, /proxy_buffering off;/);
    assert.match(exportBlock, /proxy_max_temp_file_size 0;/);
    assert.match(exportBlock, /proxy_read_timeout 300s;/);
  });

  it('points every upstream at the port deploy.sh rewrites', () => {
    const upstreams = conf.match(/proxy_pass [^;]+;/g) ?? [];
    assert.ok(upstreams.length >= 6);
    for (const u of upstreams) assert.equal(u, 'proxy_pass http://127.0.0.1:4330;');
  });
});
