# Feature coverage

The game client (`/webroot/game/TanothHtml5.js`) calls 100 distinct XML-RPC
methods. This is where each one stands: automated, used read-only, a possible
future addition, or left out on purpose.

## Automated

| Activity | Methods |
| --- | --- |
| Core state | `MiniUpdate` |
| Adventures | `GetAdventures`, `StartAdventure` |
| Dungeon (normal) | `GetDungeon`, `StartDungeon` |
| Dungeon (shadow) | `StartShadowdungeon`, `FightShadowdungeon`, `ClaimShadowdungeon` |
| Mission quest | `GetGameEvent`, `StartEventAction` |
| Map encounters | `GetMapDetails`, `GetLiberationDetails`, `StartLiberation`, `BuyLiberationEnergy` |
| Cave of Illusions | `GetCaveDetails`, `StartIllusionCave` |
| Dragon | `GetDragonDetails`, `StartDragon` |
| Arena | `Fight` |
| Work | `GetWorkData`, `StartWork` |
| Evocation Circle | `EvocationCircle_getCircle`, `EvocationCircle_buyNode` |
| Training | `GetUserAttributes`, `RaiseAttribute` |
| Auto-sell | `GetEquipment`, `SellItem` |
| Guild donation | `Guild_SpendGold` |
| Auto-login | session-fault detection + reload |

## Read-only / support

`GetPvpData`, `GetHighscore`, `GetGuildHighscore`, `GetShortUserdata`,
`GetShortGuilddata`, `GetGuild`, `GetParty`, `GetPartyItems`, `GetMount`,
`GetCompanionData`, `GetAuctionItem`, `GetAuctionDetails`.

## Possible future additions

These are safe in principle but need a live response to map the fields, or a
value model, before they can be done well:

| Method(s) | What's missing |
| --- | --- |
| `UsePotion` | HP isn't in MiniUpdate; need potion ids + a heal policy |
| `ActivateMount` | mount ids / "use best mount" mapping |
| `UseRune`, `InsertGemIntoSet`, `RemoveGemsFromSet` | gem/rune fitting needs slot selection |
| `MerchItems`, `RerollMerchItems`, `BuyItem` | merchant auto-buy needs item valuation |
| `PickCompanion`, `MoveCompanionItem`, `MoveItem` | companion/inventory layout |
| `InsertAuctionBid` | competitive bidding, easy to overpay |

## Left out on purpose

| Group | Methods | Why |
| --- | --- | --- |
| Money / premium | `Premium_buyFullAccount`, `Premium_buyGem`, `Premium_buyRune`, `UsePremiumFeatureItem`, `BuyMount`, `BuyMountBonus` | spends money or premium items |
| Premium currency | `SellBloodstones` | sells bloodstones |
| Guild admin / PvP | `Guild_Create`, `Guild_Join`, `Guild_InviteMember`, `Guild_CancelInvitation`, `Guild_FireMember`, `Guild_ChangeRanks`, `Guild_SetProfileText`, `Guild_IncreaseFeature`, `StartGuildFight`, `Guild_SpendBs` | affects other players / spends bloodstones |
| Messaging | `SendMessage`, `InsertIgm`, `GetIgm`, `GetInboxHeaders`, `GetOutboxHeaders`, `DeleteIgm`, `ReportIgm`, `ToggleMessages`, `GetMailSettings` | spam risk |
| Chat | `ChatGetToken`, `ChatJoinChannel` | not automation |
| Account | `DeleteAccount`, `UnDeleteAccount`, `ChangePassword`, `ChangeUserName`, `Logout`, `ServerReset` | destructive |
| Cosmetic | `ChangeCharPic`, `ChangeDescription`, `SetMountName` | no gameplay value |
| Client UI | `DisablePopup`, `SetTutorialWindow`, `ShowTutorial`, `Debug_ErrorTest`, `OpenWinterPresent` | client plumbing |
| Cancel tasks | `CancelAdventure`, `CancelDragon`, `CancelIllusionCave`, `CancelLiberation`, `CancelWork`, `CancelEventQuest` | the bot waits tasks out |

Every repeatable activity that yields gold, xp or loot is automated. What's left
out is money/bloodstone spending, anything that touches other players, account
operations, and a handful of gear/merchant conveniences that need a live
response to wire up.
