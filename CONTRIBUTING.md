# Contributing to Landlord

Thanks for helping. This page covers the setup, the checks every change must pass,
and where things go. How the code is organised is in
[docs/architecture.md](docs/architecture.md).

## Setup

Node 22.18 or newer (CI and the Docker image use Node 24).

```bash
npm ci
npm run dev          # Vite dev server on 0.0.0.0:5180, with the result cache
```

The dev server binds to all interfaces, so the app is reachable from other
machines at `http://<your LAN IP>:5180` as well as `http://localhost:5180`. If a
host firewall is active, allow port 5180 from your local subnet.

| Script | What it does |
|---|---|
| `npm run dev` | Web app with hot reload; results are cached in `.cache/results/` |
| `npm test` | Vitest: rule tests, the Collins validation, the rule audit, 1,500 fuzz games, UI helpers |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Type check and production bundle in `dist/` |
| `npm run preview` | Serves `dist/` on port 5180 |
| `npm run sim -- …` | CLI: example end game, `--replay SEED`, `--audit N`, `--fuzz N`, `--validate friedman\|seats\|crn`, `--sensitivity`, `--games`, `--seed`, `--profiles` |
| `npm run bench` | Games per second and a result fingerprint per setup |

Production image: `docker build -t landlord .` runs the tests and the build, and
the image serves the app and the result cache on port 3000 with data in `/data`
(`docker run -p 3000:3000 -v landlord-data:/data landlord`).

## The benchmark fingerprint rule

`npm run bench` plays fixed seeds and prints a fingerprint of the results (wins,
game lengths, bankruptcies, trajectories) for three setups. **A performance change
or refactoring must leave all three fingerprints unchanged.** A changed fingerprint
means the change altered how games are played. Run the benchmark before and after
and compare.

If the change is meant to alter play (a rule fix, a bot change), the fingerprints
change. Say so in the pull request, and bump `ENGINE_VERSION` in
`src/ui/cache.ts` so that cached results from the old engine are not shown.

## Code style

Follow the code around you:

- TypeScript in strict mode, ES modules, small functions.
- Comments are short and say why, not what. A deliberate simplification with a
  known limit is marked `ponytail:` with the limit (see `bankrupt()` in
  `src/engine/game.ts`).
- The engine (`src/engine/`) imports no DOM and no Node APIs. Policies only read the
  game; the engine validates and applies.
- No new dependencies without a strong reason. At runtime there are only React and
  the fonts; the server has none.
- Random choices use the `Rng` passed in, never `Math.random`, so games stay
  reproducible.
- No trademarked names, logos or card texts in data, code or docs.

## Where things go

| Change | Where | Docs |
|---|---|---|
| New edition or board translation | `data/<id>/`, `src/editions/<id>/`, `EDITIONS` in `src/ui/model.ts` | [docs/editions.md](docs/editions.md) |
| New house rule | `RuleConfig`, `src/engine/game.ts`, `HOUSE_RULES`, dictionary keys | [docs/house-rules.md](docs/house-rules.md) |
| New bot or profile | `BOTS`, `PROFILES` in `src/engine/policy.ts` | [docs/bots.md](docs/bots.md) |
| New statistic | `src/sim/runner.ts` | [docs/methodology.md](docs/methodology.md) |
| New validation | `src/sim/cli.ts` (`--validate …`) or a test | [docs/validation.md](docs/validation.md) |

## Rule changes: audit and fuzzing

Anything that changes what the engine does (a rule, a house rule, a card effect,
building, money, trading) needs:

1. A targeted test in `src/engine/game.test.ts` (or `trade.test.ts`) that fails
   without the change.
2. An invariant in `src/engine/audit.ts` if the change can break something the
   audit does not check yet.
3. A clean run of `npm test` and of
   `npm run sim -- --audit 300` and `npm run sim -- --fuzz 20000`
   (0 violations). The fuzzer switches every house rule on at random and mixes
   random bots with the heuristics, so it reaches combinations no test lists.
   A failing fuzz game names its index; `fuzzCase(k, seed)` in `src/sim/fuzz.ts`
   rebuilds its setup.
4. If a validated number could move, rerun that validation
   (`npm run sim -- --validate friedman`, `seats`, `crn`) and update
   [docs/validation.md](docs/validation.md).

## Pull request checklist

- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] `npm run sim -- --fuzz 5000` reports 0 violations (CI runs this too; use
      20,000 for rule changes).
- [ ] `npm run bench` fingerprints are unchanged, or the PR explains why they
      change and bumps `ENGINE_VERSION`.
- [ ] New rules and behaviour have a test.
- [ ] New UI text exists in every dictionary (see below).
- [ ] Docs are updated where behaviour, commands or numbers changed.
- [ ] No new dependency, or the PR says why it is needed.

## Translations

The UI is in English and German. `src/ui/i18n/en.ts` is the source of truth; every
other dictionary (currently `de.ts`) must have exactly the same keys, which the
`Dict` type enforces, so `npm run typecheck` fails on a missing or extra key.

- Texts are looked up with `t('key', { name: value })`; `{name}` placeholders are
  filled in. Keys ending in `.one` / `.other` are plurals, picked by
  `Intl.PluralRules` through `tp(key, n)`.
- Numbers, percentages and money go through `num`, `pct` and `money` from
  `useI18n()` (or `i18n()` outside components), never through hand-built strings.
- Names looked up by id use key families: `profile.<id>`, `group.<key>`,
  `level.<n>`, `token.<id>`, `houseRules.<id>.label|ours|official`.
- The engine emits events as data; their sentences are built in
  `src/ui/events.ts` from dictionary keys.
- The language is the saved choice (`landlord:lang` in `localStorage`), else the
  browser's; `index.html` sets it before the first paint.

Board names and card texts are not in the UI dictionaries; they belong to the
edition's `locales` block ([docs/editions.md](docs/editions.md#translations-of-an-edition)).

To add a UI language: create `src/ui/i18n/<lang>.ts` exporting a `Dict`, add the
language to `Lang`, `LANGS` and `DICTS` in `src/ui/i18n/index.ts`, map it to a
number locale in `i18n()`, and let `index.html` accept it. Add a `locales.<lang>`
block to each edition for board names and card texts.
