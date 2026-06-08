# KAGURA SPIN — Unity client (skeleton)

The C# game client (GDD §11.1). It mirrors the [`../client`](../client) TypeScript
SDK so the Unity team has a typed, ready-to-extend entry point to the same
server-authoritative backend.

> ⚠️ **Not compiled or tested in this repository.** Unlike the backend and the
> TypeScript SDK — which are verified end-to-end against running Postgres/Redis —
> this is a **skeleton**: there is no Unity engine in this repo's environment, so
> it has not been built or run. Open it in the Unity Editor to compile it. The
> code is written to compile against Unity 2021.3 LTS+ with the Newtonsoft JSON
> package, but treat it as a starting point, not a finished, verified module.

## Layout

```
unity/
  Packages/manifest.json                      # com.unity.nuget.newtonsoft-json
  Assets/KaguraSpin/
    Runtime/
      KaguraClient.cs        # async API client over UnityWebRequest
      Models.cs              # DTOs (PublicPlayer, SpinOutcome, Clan, …)
      KaguraError.cs         # typed error with code + HTTP status
      ChatConnection.cs      # clan chat over WebSocket (ClientWebSocket)
      KaguraSpin.Runtime.asmdef
    Samples/
      KaguraBootstrap.cs     # attach to a GameObject, press Play
      KaguraSpin.Samples.asmdef
```

## Open it

1. Open the `unity/` folder as a project in **Unity 2021.3 LTS or newer**.
2. The **Newtonsoft Json** package is declared in `Packages/manifest.json`; the
   editor resolves it on first open.
3. Add `KaguraBootstrap` to a GameObject, set the **Api Base Url** (default
   `http://localhost:3000`), and press **Play**. With the backend running you'll
   see register → `/me` → spin in the Console.

## Usage

```csharp
var client = new KaguraClient("http://localhost:3000");

// Device-bound auth (§11.2). Persist deviceId + deviceSecret (PlayerPrefs).
var deviceId = KaguraClient.GenerateDeviceId();
var reg = await client.RegisterAsync("Hana", deviceId);
// later: await client.LoginAsync(deviceId, reg.DeviceSecret);

var spin = await client.SpinAsync(1);
Debug.Log(spin.Outcome.Type); // JACKPOT, ATTACK, RAID, …

await client.BuildAsync(0);
var clan = await client.CreateClanAsync("Sky Foxes", "FOX");

var chat = client.ConnectChat();
chat.OnMessage += m => Debug.Log($"{m.Name}: {m.Text}");
chat.Send("Konnichiwa!");
```

Errors throw `KaguraError` with `.Code` / `.Status` (e.g. `402` /
`INSUFFICIENT_FUNDS`), mirroring the TypeScript SDK.

## Platform notes

- **Transport:** `KaguraClient` uses `UnityWebRequest`, which works on
  standalone, mobile, and WebGL.
- **WebSocket chat:** `ChatConnection` uses `System.Net.WebSockets.ClientWebSocket`,
  available on standalone/mobile but **not WebGL**. For WebGL, swap the transport
  for a jslib-backed socket (e.g. the `NativeWebSocket` package) behind the same
  `ChatConnection` surface.
- **Threading:** chat callbacks fire off the main thread — marshal to Unity's
  main thread (e.g. a `ConcurrentQueue` drained in `Update`) before touching UI.
