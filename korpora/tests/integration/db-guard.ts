/**
 * The guard of the integration suite, apart from the harness: importing it starts nothing and touches no
 * environment, so `npm run check` can test it before anyone runs a suite that empties a database.
 */

/**
 * startApp() empties every table, so the database has to say by its name that it is for tests
 * (`korpora_test`, `korpora_ci_…`): a production or development URL in TEST_DATABASE_URL wipes nothing.
 * The message names the database only — the URL carries the password.
 */
export function assertTestDatabase(url: string): void {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('refusing to run: TEST_DATABASE_URL is not a valid URL');
  }
  if (!/(^|_)(test|ci)(_|$)/i.test(name))
    throw new Error(
      `refusing to empty the database "${name}": the name of a test database contains _test or _ci`,
    );
}
