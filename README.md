# Meadow Cats

A cozy single-page game: solve math problems to earn food, feed your kitten, and raise it from level 0 to level 10. Grown cats move into a collection when you adopt a new kitten.

## Run it

From the workspace root:

```
python -m http.server 8000 --bind 127.0.0.1 --directory outputs/meadow-cats
```

Open http://127.0.0.1:8000/. It has to be served over HTTP: ES modules don’t load from `file://` URLs.

## Tests

From `outputs/meadow-cats/`:

```
node --test tests/*.test.mjs
```

No dependencies. Tests cover progression and rewards (`game`, including idle XP and growth scale), the 90-question bank with an independent math check for every answer (`questions`), save validation and failures (`storage`), cat artwork proportions (`cat`), and the scene layout (`scene`).

## How to play

- Your cat also grows on its own: +1 XP every 3.6 seconds while this tab is visible (about an hour from newborn to adult). Solving problems and feeding is much faster.
- The food buttons sit on the right (a bottom bar on phones). **Earn** opens one question for that food. A wrong answer is crossed out and shows a hint; try again as often as you like. **Show solution** explains the answer, but that question won’t give food, so you get a new one instead. Closing a question costs nothing.
- A correct answer gives one serving. **Feed** gives it to your cat: kibble +10 XP, fish +25 XP, deluxe meal +50 XP.
- Each level takes 100 XP. There are six growth stages (newborn, tiny kitten, young kitten, adolescent, young adult, adult), and the cat gets bigger every level.
- At level 10, **Adopt a kitten** starts a new cat. The grown cat moves to **Collection**. Unused food doesn’t carry over.
- Click or press Enter on the cat to pet it. Petting is just for fun and gives no XP.

Everything works with the keyboard. Escape closes dialogs. With reduced motion turned on, the cat stays still and effects finish instantly.

| Food | Questions |
| --- | --- |
| Kibble | Linear equations, factoring, quadratic roots |
| Fish | Polynomial derivatives, definite integrals |
| Deluxe meal | Substitution, integration by parts, optimization |

## Saving

Progress saves automatically to this browser’s localStorage (key `meadow-cats:v1`) after naming, earning, feeding and adopting. An open question isn’t saved, so reloading discards it without a reward.

- Saves stay on this device and in this browser. There’s no sync between devices or tabs.
- If the browser blocks or runs out of storage, a banner warns that changes last only until the tab closes.
- If a save can’t be read, the game leaves it untouched and offers **Download saved data**, **Play without saving**, or **Reset local save**. Resetting permanently deletes the old save and needs a confirmation checkbox first.
- To start over by hand, clear this site’s data in your browser settings.

## Files

| File | Role |
| --- | --- |
| `index.html`, `styles.css` | Page, scene, dialogs, layout |
| `app.mjs` | Controller: events, rendering, saving |
| `game.mjs` | Pure rules: XP, levels, rewards, feeding, adoption, question cycling |
| `questions.mjs` | The 90 questions with hints and worked solutions |
| `storage.mjs` | Save validation, load, save, reset |
| `cat.mjs` | Pixel-art cat generator (6 stages × 6 fur colors) |
| `scene.mjs` | Deterministic twilight scene (blocks, trees, torches, stars, fireflies) |

Pacing lives in two constants in `game.mjs`: `XP_PER_LEVEL` and `IDLE_MS`.
