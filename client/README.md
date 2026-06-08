# KAGURA SPIN — Client SDK + Web Demo

A **zero-dependency, isomorphic TypeScript SDK** for the KAGURA backend, plus a
small **playable web demo** built on it. This stands in for the eventual Unity
client (§11.1): it proves the API is usable from a real client and is something
you can actually run and play in a browser.

> The SDK uses the platform's global `fetch` and `WebSocket`, so it runs in the
> browser and in Node 22+. The Unity (C#) client would mirror these same calls.

## SDK

`src/index.ts` exports `KaguraClient`:

```ts
import { KaguraClient, generateDeviceId } from "@kagura/client";

const client = new KaguraClient({ baseUrl: "http://localhost:3000" });

// Device-bound auth (§11.2)
const { player, deviceSecret } = await client.register("Hana", generateDeviceId());
// ...store deviceSecret; later: await client.login(deviceId, deviceSecret)

// Core loop
const { outcome } = await client.spin(1);
await client.build(0);
await client.summon();

// Shop, clans, leaderboard
await client.shop();
await client.createClan("Sky Foxes", "FOX");
await client.leaderboard(10);

// Real-time clan chat (§7.2)
const chat = client.connectChat((e) => {
  if (e.type === "chat") console.log(`${e.name}: ${e.text}`);
});
chat.send("Konnichiwa!");
```

Errors surface as `KaguraError` with `.code`, `.status`, `.message`.

The SDK is covered by `backend/test/sdk.test.ts`, which boots the in-memory
backend and drives every call (auth, spin, shop, IAP, clans, WebSocket chat)
over real HTTP/WS.

```bash
npm install
npm run build       # → dist/ (ESM + .d.ts)
npm run typecheck
```

## Web demo

A single-page playable client (`demo/`): register, spin the Spirit Wheel, build
your island, summon companions, buy from the shop, climb the leaderboard, and
chat with your clan in real time — themed with the GDD §9.2 palette.

```bash
# 1) Start the backend with CORS for the demo origin + dev sandbox receipts:
cd ../backend
CORS_ORIGINS=http://localhost:5173 ENABLE_DEV_RECEIPTS=true npm run dev

# 2) Build the SDK and serve the demo:
cd ../client
npm run demo        # builds + serves http://localhost:5173/demo/
```

Open http://localhost:5173/demo/ and press **Play**.

- `?api=` query overrides the backend URL (default `http://localhost:3000`).
- The **Buy** buttons use a dev-only `/iap/dev-receipt` endpoint (enabled by
  `ENABLE_DEV_RECEIPTS=true`) so the real receipt-validation → ledger-grant flow
  runs without store integration. **Never enable that flag in production.**
- The leaderboard panel needs the backend started with `REDIS_URL` set;
  otherwise it shows "no Redis leaderboard configured".

## LiveOps console

An ops dashboard (`admin/`) for live-tuning the economy (§6.2) via `GET/PUT
/admin/liveops` — no redeploy. It renders an editable form for every numeric
config leaf (reel weights with a distribution preview, payouts, gacha rates +
pity, spin energy, island cost curves, prices), and pushes the whole config
back; the server re-validates it with the same zod schema and surfaces any
issue inline.

```bash
# Backend with the admin key + CORS for the console origin:
ADMIN_API_KEY=change-me CORS_ORIGINS=http://localhost:5173 npm run dev   # in ../backend

npm run demo            # serves the console at http://localhost:5173/admin/
```

Open http://localhost:5173/admin/, enter the API base + admin key, and tune. A
push takes effect on the **very next** spin/build/summon — the GameService reads
the config live.
