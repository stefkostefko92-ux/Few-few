# Feature coverage

Audited against **every** XML-RPC method the live Tanoth client calls
(`/webroot/game/TanothHtml5.js` — 100 distinct methods). Each is either
**automated**, **read-only/support**, a **candidate** (could be added; why not
yet), or **excluded by design** (with the reason). Nothing is "missing by
accident" — anything not automated is a deliberate choice.

## ✅ Automated (15 activities / modules)

| Activity | Methods |
| --- | --- |
| Core state | `MiniUpdate` |
| Adventures | `GetAdventures`, `StartAdventure` |
| Dungeon (normal) | `GetDungeon`, `StartDungeon` |
| Dungeon (shadow) | `StartShadowdungeon`, `FightShadowdungeon`, `ClaimShadowdungeon` |
| Mission / event quest | `GetGameEvent`, `StartEventAction` |
| Map encounters (Liberation) | `GetMapDetails`, `GetLiberationDetails`, `StartLiberation`, `BuyLiberationEnergy` |
| Cave of Illusions | `GetCaveDetails`, `StartIllusionCave` |
| Dragon event | `GetDragonDetails`, `StartDragon` |
| Arena / PvP | `Fight` |
| Work / jobs | `GetWorkData`, `StartWork` |
| Evocation Circle | `EvocationCircle_getCircle`, `EvocationCircle_buyNode` |
| Training (attributes) | `GetUserAttributes`, `RaiseAttribute` |
| Auto-sell | `GetEquipment`, `SellItem` |
| Guild gold donation | `Guild_SpendGold` |
| Auto-login | (DOM/URL heuristics + session-fault detection) |

## 📖 Read-only / support (available; used for decisions)
`GetPvpData`, `GetHighscore`, `GetGuildHighscore`, `GetShortUserdata`,
`GetShortGuilddata`, `GetGuild`, `GetParty`, `GetPartyItems`, `GetMount`,
`GetCompanionData`, `GetAuctionItem`, `GetAuctionDetails`.

## 🛠️ Candidates — could be added (not yet, and why)
These are *safe in principle* but need data/heuristics that aren't reliably
exposed without a live account to sample first:

| Method(s) | Blocker |
| --- | --- |
| `UsePotion` | HP isn't surfaced by MiniUpdate; needs potion ids + a "when to heal" policy |
| `ActivateMount` | mount ids/selection not exposed; needs a "use best mount" mapping |
| `UseRune`, `InsertGemIntoSet`, `RemoveGemsFromSet` | gem/rune fitting needs target-slot selection + value model |
| `MerchItems`, `RerollMerchItems`, `BuyItem` | merchant auto-buy needs an item-valuation model (could mis-spend gold) |
| `PickCompanion`, `MoveCompanionItem`, `MoveItem` | companion/inventory arrangement — cosmetic-ish, needs grid model |
| `InsertAuctionBid` | competitive gold bidding — easy to overpay; opt-in only, later |

Say the word and I'll wire any of these — most just need one captured live
response to lock the field names.

## 🚫 Excluded by design (safety / ethics — intentionally NOT automated)

| Group | Methods | Reason |
| --- | --- | --- |
| Real-money / premium spend | `Premium_buyFullAccount`, `Premium_buyGem`, `Premium_buyRune`, `UsePremiumFeatureItem`, `BuyMount`, `BuyMountBonus` | spends money / premium items — never automatic |
| Premium currency | `SellBloodstones` | irreversibly sells bloodstones |
| Guild administration / PvP politics | `Guild_Create`, `Guild_Join`, `Guild_InviteMember`, `Guild_CancelInvitation`, `Guild_FireMember`, `Guild_ChangeRanks`, `Guild_SetProfileText`, `Guild_IncreaseFeature`, `StartGuildFight`, `Guild_SpendBs` | affects other players / spends bloodstones |
| Messaging | `SendMessage`, `InsertIgm`, `GetIgm`, `GetInboxHeaders`, `GetOutboxHeaders`, `DeleteIgm`, `ReportIgm`, `ToggleMessages`, `GetMailSettings` | could spam / impersonate |
| Chat | `ChatGetToken`, `ChatJoinChannel` | not automation |
| Account / dangerous | `DeleteAccount`, `UnDeleteAccount`, `ChangePassword`, `ChangeUserName`, `Logout`, `ServerReset` | destructive / account control |
| Cosmetic | `ChangeCharPic`, `ChangeDescription`, `SetMountName` | no gameplay value |
| UI / tutorial / seasonal | `DisablePopup`, `SetTutorialWindow`, `ShowTutorial`, `Debug_ErrorTest`, `OpenWinterPresent` | client UI plumbing |
| Cancel running tasks | `CancelAdventure`, `CancelDragon`, `CancelIllusionCave`, `CancelLiberation`, `CancelWork`, `CancelEventQuest` | the bot waits tasks out; cancelling wastes them |

---

**Summary:** every repeatable, gold/XP/loot-generating daily activity in the game
is automated. The only things left out are (a) spending real money / bloodstones,
(b) actions that affect other players, (c) account-destructive operations, and
(d) a few gear/merchant/companion conveniences that need a live response sample
to implement safely — all listed above so the coverage is fully transparent.
