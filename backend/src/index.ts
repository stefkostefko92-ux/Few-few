import { defaultLiveOps } from "./config/liveops.js";
import { Ledger } from "./data/ledger.js";
import { MemoryPlayerRepository } from "./data/memoryRepository.js";
import { createApp } from "./http/app.js";
import { GameService } from "./services/gameService.js";

/**
 * Prototype bootstrap. Wires the in-memory repository + ledger into the game
 * service and serves the HTTP API. Production swaps the repository for a
 * Prisma/Postgres adapter and the in-process ledger for the Postgres ledger
 * table — the service and routes stay identical.
 */
function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  const game = new GameService({
    repo: new MemoryPlayerRepository(),
    ledger: new Ledger(),
    config: defaultLiveOps,
  });
  const app = createApp(game);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KAGURA backend (prototype) listening on :${port}`);
  });
}

main();
