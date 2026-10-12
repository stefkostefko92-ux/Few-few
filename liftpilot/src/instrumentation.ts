// What the server checks once at its start, before it answers (Next.js instrumentation): only in the Node runtime — the
// condition is the form Next.js resolves at build time, so the edge bundle never sees the Node-only checks
// (instrumentation-node.ts).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startChecks } = await import('./instrumentation-node');
    startChecks();
  }
}
