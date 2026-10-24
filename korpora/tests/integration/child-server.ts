/**
 * The app in a second process, with settings the main test process cannot have (production mode, another
 * retention period): config() is read once per process. The parent sets the environment (child.ts); this
 * file loads what src/index.ts loads, listens on a free port and prints it.
 */
const { createServer } = await import('../../src/server.js');
const { loadEngine } = await import('../../src/services/engine.js');
const { loadGeoIp } = await import('../../src/auth/geoip.js');

await loadEngine();
await loadGeoIp();
const server = createServer().listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.stdout.write(`listening ${address.port}\n`);
});

// a throwaway process: no graceful close (a keep-alive connection of the parent would hold it open)
process.on('SIGTERM', () => process.exit(0));
