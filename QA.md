# QA record

Date: 2026-09-26. Environment: Windows 11, Node v24.21.0, Python 3.14.5 `http.server`, Chromium via Playwright.

## Automated tests

`node --test tests/*.test.mjs` from `outputs/meadow-cats/`: **160 tests, 160 pass, 0 fail.**

| File | Tests | Covers |
| --- | --- | --- |
| `game.test.mjs` | 30 | Every level boundary and stage threshold, overflow (95 + 10 → level 1, 5/100), cap (990 + 50 → 1000), empty inventory, adult no-ops, wrong answers change attempts only, repeated correct/incorrect clicks, revealed and stale-cat challenges, mismatched questions, unknown IDs, blank/overlong/emoji names, adoption exactly once, deterministic shuffle, no repeats within a cycle or at refill, input immutability |
| `questions.test.mjs` | 98 | Structure (90 unique IDs, 30 per tier, 4 distinct choices, one correct ID, nonempty text) and one math check per question, plus the four named edge cases |
| `storage.test.mjs` | 29 | Round trip, empty, bad JSON, 20 invalid-shape cases, load never writes, blocked storage, quota error keeps old value, failed reset keeps old value |
| `cat.test.mjs` | 3 | Palettes complete, four growing and distinct silhouettes, shared paw baseline inside the grid |

## Math verification

The test doesn’t trust the bank’s marked answers. A small test-only parser (`tests/math.mjs`) evaluates the displayed text of all four choices. An independent check written from each prompt must select exactly one choice, and it must be the marked one:

- Linear equations: the value satisfies lhs − rhs = 0.
- Factoring: the choice equals the original polynomial at five points.
- Quadratics: compared with roots from the quadratic formula (both roots, a repeated root, or the specified positive/negative/larger root).
- Derivatives: compared with a central-difference numerical derivative at five points, or at the given x.
- Definite integrals: Simpson’s rule, including reversed bounds (f20, f28).
- Antiderivatives: the numerical derivative of the choice equals the integrand at five points on the stated domain. Every choice must end in `+ C`.
- Optimization: dense grid search over the stated interval with endpoints included. Endpoints win in d24 and d29.

The same check proves every distractor wrong on the stated domain. A mutation run confirmed it can fail: marking a wrong answer as correct (k01) failed, and so did adding a second equivalent correct answer (d17). The parser has its own self-test. I read all worked solutions by hand for consistency with their answers.

## Browser checks

Checked at 1280×800, 390×844, 320×640, and 640×400 (the same CSS width as 200% zoom at 1280×800).

| Check | Result |
| --- | --- |
| Name → earn → wrong answer (hint, crossed out) → correct → feed | Pass. Serving saved before the celebration; XP bar, float, and bowl showed |
| Double-clicking the correct answer | Pass. Exactly 1 serving |
| 990 XP + deluxe → adult | Pass. Saved 1000 (“+10 XP”); food cards replaced by the adoption panel; focus moved to Adopt |
| Adoption submitted 3× rapidly | Pass. Archived once; new kitten at 0 XP with empty food; default color moved to the next one (ginger → cream) |
| Collection | Pass. Adult art, name, color, order. Emoji name with 24 code points renders |
| Name over 24 code points in a save | Pass. Recovery dialog appeared; raw save unchanged |
| Simulated `setItem` quota error | Pass. Warning banner shown; stored value unchanged |
| Reduced motion | Pass. Feeding finishes immediately, no floating effects, Feed unlocks on the next tick, cat stays still |
| Keyboard | Pass. Tab to Earn → Enter opens the question with focus on the first choice; Escape closes; focus returns to Earn (and to Collection from the collection dialog) |
| 320 px | Found and fixed a 5 px horizontal overflow (scene `aspect-ratio` + `min-height`) and a cramped dialog. The final review found overflow from a 24-character name with no spaces (393 px page vs 305); fixed with `overflow-wrap: anywhere`, now 305/305 |
| Escape on required dialogs | The final review found that Chromium lets a second Escape close the naming and recovery dialogs, leaving a dead game. Fixed by reopening them on close while still required. Verified: open after 3 Escapes; naming, reset, and play-without-saving still close them |
| 640×400 | No horizontal overflow; question dialog capped to the viewport and scrollable |
| Console | No errors or warnings once the favicon 404 was fixed |

Contrast (WCAG AA needs 4.5:1 for normal text): body text 12.3, secondary text 6.4, white on green buttons 5.1, disabled buttons 4.7, error text 6.3. All pass. This isn’t a full accessibility audit.

Screenshots are in `qa/`: onboarding, eating, all 24 stage/color combinations, adult, collection, and two phone views.

## Pacing

**The 20–30 minute target has not been validated.** No human playtest was available, and automated click-throughs only prove the mechanics work. At the current values, adulthood takes 100 kibble, 40 fish, or 20 deluxe servings (1000 XP). `XP_PER_LEVEL` stays at the proposed 100. To validate, time several players across all three tiers and record how many questions they answer, how often they retry or reveal, and how long it takes. If the timing is off, change only `XP_PER_LEVEL`.

## Known limitations

- Only tested in Chromium. Firefox and Safari haven’t been checked. The color picker’s selected style uses `:has()`; the radio inputs still work without it.
- No sync between tabs: two open tabs can overwrite each other’s saves (the spec accepts this).
- Screen readers haven’t been tested. Live-region text and labels were only checked in the DOM.

---

# v2 (2026-09-26): idle growth, twilight full-screen scene, six stages

`node --test tests/*.test.mjs`: **169 tests, 169 pass, 0 fail.** New since v1:
- `game`: idle tick (+1 XP, cap, adult no-op, immutability), the idle-only hour (1000 × 3600 ms = 60 min), the six stage boundaries at every level, and `catScale` (0.45 → 1, strictly increasing).
- `cat`: six stages in order, each silhouette strictly larger than the last, one shared baseline.
- `scene`: deterministic layout; the walk range is flat grass; the walk range and trees stay clear of the rail; `minGround` keeps the grass above the phone bar (including 640×360); 40 stars, 14 fireflies, 2 hill layers and a moon.

## Browser checks (Chromium via Playwright, clock-controlled)

| Check | Result |
| --- | --- |
| Idle ticking | 36 s visible → +10 XP. 36 s with the tab hidden → +0. 3.6 s after returning → +1, with no burst |
| Idle to adult with a question open | 999 → 1000; the adult panel replaced the rail; answering correctly gave 0 servings; Escape put focus on Adopt a kitten |
| Idle level-up effects | Pop, 5 sparkles and a “Level 2!” label; newborn → tiny kitten; scale 0.505 → 0.56 |
| v1 save (350 XP) | Shows “Level 3, tiny kitten” at scale 0.615; the stored save is byte-identical after load |
| Growth | Cat width by level: L0 86, L2 108, L4 129, L6 150, L8 171, L10 192 px; six distinct models (`qa/v2-growth.png`) |
| Reduced motion | No pop or sparkles; scale still updates; fireflies and stars visible with `animation-name: none`; Feed unlocks immediately |
| Layout at 1280×800, 390×844, 320×640, 640×400 (≈200% zoom), 640×360 | No horizontal or vertical page scroll, including a 24-character name with no spaces. The cat’s paws sit exactly on the grass, inside the walk range after every resize, and above the phone bottom bar |
| Fixed during checks | “Collection” wrapped mid-word (buttons are now `nowrap`); the moon was hidden under the HUD; the horizon glow sat behind the ground; the cat was under the HUD on 640×360 (short screens now use a 96 px cat) |
| Console | No errors |

## Contrast (WCAG AA, 4.5:1)

| Pair | Ratio |
| --- | --- |
| Text on panel | 14.4 |
| Secondary text on panel | 9.6 |
| Text on raised button | 12.3 |
| Amber button text | 8.3 |
| Disabled button | 5.7 |
| Wrong answer | 9.3 |
| Right answer | 9.5 |
| Error text | 8.3 |
| Warning banner | 11.8 |
| Input placeholder | 6.2 |
| Worst case (90% panel over the orange horizon) | 13.9 for text, 9.3 for secondary text |

## Pacing

Idle-only adulthood is 1000 × 3.6 s = 60 minutes by construction. The pace with math is still unvalidated by human play.

## Known limitations (v2)

- On a 640×360 landscape phone with a 24-character name that wraps to two lines, the HUD slightly covers an adult cat’s ears.
- Idle ticks rely on `setInterval`. Browsers may throttle it in background tabs, but those tabs don’t earn anyway, because each tick checks visibility.
- Multiple tabs: each tab picks up saves made by the others through the `storage` event, so a stale tab no longer overwrites newer progress. Two tabs visible at the same time still both earn idle XP.

## Fixed after the v2 final review (browser repro RED → GREEN)

| Issue | Before | After |
| --- | --- | --- |
| A stale tab’s idle tick overwrote the save | Tab B saved 5 kibble; tab A’s tick wrote 0 | A now shows and keeps 5. An adoption made in B also carries over into A: A closes its dialog and keeps the collection |
| Idle reaching adult left the open question dead | Dialog open, choices did nothing | The dialog closes and focus goes to Adopt a kitten |
| The phone toast stayed on screen and covered the HUD or cat | Still showing after 8 s, overlapping the HUD | The toast sits inside the HUD panel on phones and clears after 4 s |
