// Официалната проверка на генерираните е-фактури — не нашите правила, а артефактите на стандарта:
//   1. XSD: OASIS UBL 2.1 (Invoice, CreditNote) и UN/CEFACT CII D16B — xmllint;
//   2. Schematron: CEN EN 16931 (UBL и CII) и OpenPeppol BIS Billing 3.0 (UBL) — Saxon-HE (Java).
// Артефактите се свалят от Maven Central с фиксирани версии и SHA-256 (подменен файл = спиране).
// Изисква: java ≥ 11, xmllint, мрежа до repo1.maven.org при първото пускане (после — кеш).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cache = join(root, 'scripts', 'conformance', '.cache');
const MAVEN = 'https://repo1.maven.org/maven2';

const ARTEFACTS = {
  en16931: {
    path: 'com/helger/phive/rules/phive-rules-en16931/4.6.4/phive-rules-en16931-4.6.4.jar',
    sha256: 'c0e53553d9093a96192fcbfd42670eeae43cf8471d617e5d04bd8bc837d3c726',
  },
  peppol: {
    path: 'com/helger/phive/rules/phive-rules-peppol/4.6.4/phive-rules-peppol-4.6.4.jar',
    sha256: 'c8a783c5ebc0b9d8d806aa27129694f16d9ac48b37eae3e90cc095da5acb31e4',
  },
  ubl21: {
    path: 'com/helger/ubl/ph-ubl21/10.2.1/ph-ubl21-10.2.1.jar',
    sha256: '0bb13039b0f0983df9cf8c6f98b1f0f0c992bbd9ae2196766573e61607402405',
  },
  cii: {
    path: 'com/helger/cii/ph-cii-d16b/10.1.0/ph-cii-d16b-10.1.0.jar',
    sha256: '96de61ced70a5ceb1bcc97dc54f5bb102c3527d7bc27abd1e6a507ed6ade64d5',
  },
  saxon: {
    path: 'net/sf/saxon/Saxon-HE/12.5/Saxon-HE-12.5.jar',
    sha256: '98c3a91e6e5aaf9b3e2b37601e04b214a6e67098493cdd8232fcb705fddcb674',
  },
  xmlresolver: {
    path: 'org/xmlresolver/xmlresolver/5.2.2/xmlresolver-5.2.2.jar',
    sha256: 'efc92bd7ed32b3e57095e0b3e872051ccfbbdcc980831ef33e89e38161a85222',
  },
  // Схемите, които UBL 2.1 импортира само по пространство от имена (без schemaLocation).
  ccts: {
    path: 'com/helger/xsd/ph-xsds-ccts-cct-schemamodule/4.1.1/ph-xsds-ccts-cct-schemamodule-4.1.1.jar',
    sha256: '85119e35f3239932aeef4f6a963cb35ba7ec03e486f5f33acb9203b39b0e8728',
  },
  xmldsig: {
    path: 'com/helger/xsd/ph-xsds-xmldsig/4.1.1/ph-xsds-xmldsig-4.1.1.jar',
    sha256: '1b5c1a2680cb254afc5032e3588604516e0a5a6856084d7349ef9c60fb073de5',
  },
};

/** SAF-T BG XSD 1.0.3 (docs/saf-t/README.md — произход и сверка с официалния архив). */
const SAFT_XSD_SHA256 = 'a152c5d02f359d7d1c132121d82db63492eed23cf0475b85f27069a2074d188f';

/** Версиите на правилата вътре в архивите. */
const RULES = {
  en16931Ubl: 'external/schematron/1.3.17/ubl/EN16931-UBL-validation.xslt',
  en16931Cii: 'external/schematron/1.3.17/cii/EN16931-CII-validation.xslt',
  peppolUbl: 'external/schematron/openpeppol/2026.5/xslt/PEPPOL-EN16931-UBL.xslt',
  ublInvoiceXsd: 'external/schemas/ubl21/maindoc/UBL-Invoice-2.1.xsd',
  ublCreditNoteXsd: 'external/schemas/ubl21/maindoc/UBL-CreditNote-2.1.xsd',
  ciiXsd: 'external/schemas/d16b/data/standard/CrossIndustryInvoice_100pD16B.xsd',
};

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function fetchArtefact(name, { path, sha256: expected }) {
  const file = join(cache, `${name}.jar`);
  if (!existsSync(file) || sha256(file) !== expected) {
    const response = await fetch(`${MAVEN}/${path}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const actual = sha256(file);
  if (actual !== expected) throw new Error(`${name}: SHA-256 ${actual} ≠ ${expected} — спирам`);
  return file;
}

function extract(jar, dir) {
  if (existsSync(join(dir, '.done'))) return;
  mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-q', '-o', jar, 'external/*', '-d', dir]);
  writeFileSync(join(dir, '.done'), '');
}

function xsd(schema, file) {
  const run = spawnSync('xmllint', ['--noout', '--nonet', '--schema', schema, file], {
    encoding: 'utf8',
  });
  if (run.status === 0) return [];
  return run.stderr
    .trim()
    .split('\n')
    .filter((line) => !line.endsWith(' validates'))
    .slice(0, 8);
}

/**
 * UBL 2.1 в ph-ubl21 импортира CCTS и XML-DSig само по пространство от имена (ph-ubl ги намира през
 * каталог). За xmllint копираме двете схеми до тях и дописваме schemaLocation — само в кеша, не в стандарта.
 */
function wireUblImports(ublDir, cctsJar, xmldsigJar) {
  const common = join(ublDir, 'external', 'schemas', 'ubl21', 'common');
  if (existsSync(join(common, '.wired'))) return;
  execFileSync('unzip', [
    '-q',
    '-o',
    '-j',
    cctsJar,
    'schemas/CCTS_CCT_SchemaModule.xsd',
    '-d',
    common,
  ]);
  execFileSync('unzip', [
    '-q',
    '-o',
    '-j',
    xmldsigJar,
    'schemas/xmldsig-core-schema.xsd',
    '-d',
    common,
  ]);
  const patch = (file, namespace, location) => {
    const path = join(common, file);
    const text = readFileSync(path, 'utf8');
    const re = new RegExp(
      `(<xsd:import\\s+namespace="${namespace.replace(/[.#]/g, '\\$&')}")\\s*/>`,
    );
    if (!re.test(text)) throw new Error(`${file}: няма import на ${namespace}`);
    writeFileSync(path, text.replace(re, `$1 schemaLocation="${location}"/>`));
  };
  patch(
    'UBL-UnqualifiedDataTypes-2.1.xsd',
    'urn:un:unece:uncefact:data:specification:CoreComponentTypeSchemaModule:2',
    'CCTS_CCT_SchemaModule.xsd',
  );
  patch(
    'UBL-SignatureAggregateComponents-2.1.xsd',
    'http://www.w3.org/2000/09/xmldsig#',
    'xmldsig-core-schema.xsd',
  );
  writeFileSync(join(common, '.wired'), '');
}

/** SVRL → съобщенията с flag="fatal" (грешки) и flag="warning". */
function schematron(jars, xslt, file) {
  const run = spawnSync(
    'java',
    ['-cp', jars.join(':'), 'net.sf.saxon.Transform', `-s:${file}`, `-xsl:${xslt}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0)
    return { fatal: [`Saxon: ${run.stderr.trim().split('\n').slice(-3).join(' ')}`], warning: [] };
  const fatal = [];
  const warning = [];
  const re = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
  for (const match of run.stdout.matchAll(re)) {
    const attrs = match[1];
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '?';
    const flag = /\bflag="([^"]*)"/.exec(attrs)?.[1] ?? 'fatal';
    const text =
      /<svrl:text>([\s\S]*?)<\/svrl:text>/.exec(match[2])?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    (flag === 'warning' ? warning : fatal).push(`${id}: ${text}`);
  }
  return { fatal, warning };
}

async function main() {
  mkdirSync(cache, { recursive: true });
  const jars = {};
  for (const [name, artefact] of Object.entries(ARTEFACTS))
    jars[name] = await fetchArtefact(name, artefact);
  const dirs = {};
  for (const name of ['en16931', 'peppol', 'ubl21', 'cii']) {
    dirs[name] = join(cache, name);
    extract(jars[name], dirs[name]);
  }
  wireUblImports(dirs.ubl21, jars.ccts, jars.xmldsig);
  const saxonCp = [jars.saxon, jars.xmlresolver];

  let failures = 0;
  for (const profile of ['en16931', 'peppol']) {
    execFileSync('npx', ['tsx', 'scripts/samples.ts', profile], { cwd: root, stdio: 'inherit' });
    const dir = join(root, 'samples', profile);
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      const isUbl = name.endsWith('.ubl.xml');
      const isCredit = readFileSync(file, 'utf8').includes('<CreditNote ');
      const schema = isUbl
        ? join(dirs.ubl21, isCredit ? RULES.ublCreditNoteXsd : RULES.ublInvoiceXsd)
        : join(dirs.cii, RULES.ciiXsd);
      const checks = [['XSD', { fatal: xsd(schema, file), warning: [] }]];
      checks.push([
        'EN 16931',
        schematron(saxonCp, join(dirs.en16931, isUbl ? RULES.en16931Ubl : RULES.en16931Cii), file),
      ]);
      if (profile === 'peppol' && isUbl) {
        checks.push([
          'Peppol BIS 3',
          schematron(saxonCp, join(dirs.peppol, RULES.peppolUbl), file),
        ]);
      }
      for (const [label, result] of checks) {
        const ok = result.fatal.length === 0;
        if (!ok) failures += 1;
        console.log(`${ok ? '✓' : '✗'} ${profile}/${name} · ${label}`);
        for (const line of result.fatal) console.log(`    ✗ ${line}`);
        for (const line of result.warning) console.log(`    ⚠ ${line}`);
      }
    }
  }
  // Данните за SAF-T — срещу XSD 1.0.3 на НАП от docs/saf-t/ (копие с проверен SHA-256 — виж README там).
  const saftXsd = join(root, 'docs', 'saf-t', 'BG_SAFT_Schema_V_1.0.3.xsd');
  const saftSha = createHash('sha256').update(readFileSync(saftXsd)).digest('hex');
  if (saftSha !== SAFT_XSD_SHA256)
    throw new Error(`docs/saf-t: SHA-256 ${saftSha} не е очакваният`);
  execFileSync('npx', ['tsx', 'scripts/saft-samples.ts'], { cwd: root, stdio: 'inherit' });
  const saftDir = join(root, 'samples', 'saft');
  for (const name of readdirSync(saftDir).sort()) {
    const fatal = xsd(saftXsd, join(saftDir, name));
    if (fatal.length > 0) failures += 1;
    console.log(`${fatal.length === 0 ? '✓' : '✗'} saft/${name} · XSD 1.0.3 (НАП)`);
    for (const line of fatal) console.log(`    ✗ ${line}`);
  }
  if (failures > 0) {
    console.error(`\n${failures} проверки се провалиха`);
    process.exit(1);
  }
  console.log(
    '\nВсички документи минават официалните XSD и Schematron правила; данните за SAF-T — XSD 1.0.3.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
