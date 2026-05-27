# Realms of Tanoth

A single-page browser RPG inspired by the classic *Tanoth*. Pure HTML/CSS/JS — no
build step, no backend. State is saved to `localStorage`.

## Play

Open `index.html` in a browser. Or serve the folder:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **Three classes** — Warrior (melee/STR), Ranger (ranged/DEX), Mage (magic/INT),
  each with a unique special ability.
- **Town with locations**: Tavern (rest + quests), Adventures (time-based
  expeditions), Arena (turn-based duels), Blacksmith (buy/sell/equip),
  Healer (HP/MP restore + potions), Training Hall (spend stat points),
  Character sheet.
- **Turn-based combat** — basic attack, class skill, flee. Crit and dodge
  driven by DEX. Loot drops from foes.
- **Adventures run in real time** — embark and the timer ticks down while
  you do other things in town. Encounters trigger on completion.
- **Progression** — XP, level ups grant stat points; equipment slots for
  weapon, armor, helm, boots, ring; rarity-tinted items.
- **Quests** — accept bounties at the tavern, complete them by slaying
  monsters in the arena.
- **Auto-save** every 30 seconds, plus manual save and "new hero" reset.

## Files

- `index.html` — page shell, screens, combat overlay
- `style.css` — medieval/fantasy theme
- `game.js` — all game logic and rendering
