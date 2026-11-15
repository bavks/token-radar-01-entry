# SOONAIR — a soon airdrop radar

SOONAIR (formerly Sonar) reads the sealed token-radar-01 snapshot (DefiLlama's protocol index,
frozen by the house) and hunts the next airdrop: for every protocol that records no token yet it
estimates what a launch would be worth if it were priced the way this market already prices
launched protocols, how likely a drop looks, whether the window to farm it is probably still
open, what joining costs and how hard the farm is — and gives the reader a plan to be positioned
before any user snapshot is taken.

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, writes the ranked board
to `/output/board.json`, writes the dashboard's data to `/output/data.js`, copies `dashboard/` and
`screenshots/` into `/output`, and writes `/output/dossier.json` with the vendored
`vendor/makefun-board.ts`, exactly as the bounty requires. The dashboard is a static page — no
framework, no network — laid out as a desktop workspace: a filter rail (search, category, chain,
watchlist-only) beside a dense board (rank, protocol, TVL, 7-day change, airdrop estimate and
implied value, with the window, cost and difficulty calls carried as badges under each name), a
two-column detail view per protocol whose airdrop outlook panel and pricing workings sit beside
the farm-plan timeline, a live-token view with a summary strip, and a model view that states the
method beside its comparable set. Every graphic on the page is drawn from the board's own
figures, which `lib/model.ts` aggregates into `data.js` beside the rows: a market-pulse strip
over the board (the ranked set's total TVL, its median 7-day change, gainers against losers as a
proportion bar, and the newest listing by first-tracked date), a slim TVL bar and a signed
centre-zero change bar inside each row, a newest-listings rail under the board, a category
landscape of aggregate TVL on the model view, and — in each detail view — the protocol's
position in the field: TVL and implied-value percentile bars against all 198 ranked rows, and
its implied multiple set against its own category's median. The snapshot carries no social,
user or funding data, so the page shows none: freshness here means listing dates, and momentum
means TVL change — the signals the record actually holds.

## The value model (soonair-1)

One function scores every row; no protocol name is special-cased anywhere.

```
implied value = TVL × R(category) × G(7d growth) × M(track record) × B(chains)
```

- **R — the comparable multiple.** Every launched protocol in the snapshot that carries a market
  cap gives one observation of FDV/TVL. Observations are winsorized to [0.01, 4] — past that band
  the ratio in this snapshot is an artifact (a holding-company market cap over a sliver of TVL),
  not a price the market pays for a protocol business. A category's multiple is the median of its
  observations, shrunk toward the global median in log space with a prior strength of 5
  observations, so a category with one loud comparable borrows most of its multiple from the whole
  market (144 comparables; global median ≈ ×0.17) and a category with fifteen mostly speaks for
  itself. The result is clamped to [0.02, 2.5]. The dashboard's model view prints the whole
  comparable table, so any row's price can be traced to the set that produced it.
- **G — momentum.** `1 + clamp(change_7d, −45, 80) / 100 × 0.55`, floored at 0.60. TVL gathering
  into a launch is worth more than the same TVL draining away; an unreported change counts as 0.
- **M — track record.** `0.80 + 0.40 × (1 − exp(−age_days / 500))`. A protocol that has run for
  years with no token has a proven product a launch can price; a three-week-old one is discounted,
  not zeroed. An unrecorded listing date counts as 200 days.
- **B — breadth.** `1 + 0.025 × min(chains − 1, 6)`. Each extra chain already served is
  distribution a token launches into — worth a little, capped at +15%.

## The airdrop scoring layer

A second set of figures, computed into `data.js` only — `board.json` never carries them — and
published in full on the dashboard's model view under "How SOONAIR scores", so any number on the
board can be re-derived by hand. Every one of them is a model estimate, labelled as such wherever
it appears; none is a measurement, and none uses anything outside the snapshot.

- **Airdrop likelihood, 0–100.** Five parts. *Category launch share*, 40 points: the share of
  the category's own snapshot protocols that already record a token, shrunk toward the
  snapshot-wide share (416 of 758, ≈55%) with a prior of 5 — the same shrinkage R uses.
  *TVL band*, 25: a log ramp from $5M (no points) to $2B (full points). *Track record*, 15:
  `1 − exp(−age_days / 400)`, an unrecorded listing date counting as 200 days. *Momentum*, 10:
  the 7-day TVL change mapped from −20% across a 60-point span. *Breadth*, 10: chains served,
  full at 6. The detail page prints all five parts of every row.
- **Snapshot window.** Protocols do not publish snapshot dates, so SOONAIR shows an estimate
  from age alone and never a date dressed as one: under 365 days since first tracked, *window
  likely open*; under 1,095 days, *window uncertain* (a protocol with no listing date on record
  reads uncertain too); older, *snapshot risk: likely taken*. The first-tracked date beside the
  call is a fact from the record.
- **Entry cost.** Read off the row's own farm plan. *Free*: the payments and card family, whose
  joining is an account signup and locks no position. *Capital*: the plan's core step locks a
  position — its text commits to supply, deposit, stake, mint, margin, collateral or a liquidity
  pool — of $150 or more, the plan's own capital figure for a protocol of its size. *Low $*:
  everything smaller, a balance worked rather than a position locked.
- **Difficulty.** Points: 1 for a plan of 6 or more steps, the cost class itself (Free 0,
  Low $ 1, Capital 2), and 1 for a protocol spread over 5 or more chains. A total of 0–2 reads
  *Easy*, 3 *Medium*, 4 *Hard*.

## Who is ranked

The watchlist is the floor: all 40 of its protocols are always on the board. Around it, the radar
applies the watchlist's own product test at every size, above the floor as well as below it (20
protocols above the floor pass the test but sit off the list; the snapshot carries no parent
record, so the test is the part of the rule the snapshot can check). A protocol is ranked when it
records no token — no market cap, no CoinGecko id, no symbol — and is not a wrapped, staked or
bridged product of a token that already trades (category Bridge, Canonical Bridge, Liquid Staking,
Liquid Restaking or Restaked BTC; a name carrying the whole word *wrapped*, *staked* or *staking*;
a name beginning with an exchange's name), not an exchange itself (CEX), and not a versioned pool
of another protocol (a name ending in V2, 2.0 and the like). That leaves 198 ranked rows on this
snapshot. Protocols whose token already trades are never ranked: the dashboard sets them aside and
shows them at the market's own values.

## Farm plans

Each row carries a seven-step plan generated from its own record: the category family decides the
actions (a lender's plan supplies and borrows; an exchange's swaps and provides liquidity; a
curator's holds two vaults), the first chain names the gas asset, TVL sizes the capital ($40–$500),
age sets the hold (30–75 days, long enough to span several weekly snapshots), and the seven-day
change sets the sizing note — a protocol whose TVL fell hard that week gets a halved first position,
not the standard one. Every step states what it costs and how long it takes.

## The dashboard's display layer

The masthead carries the board's own vital signs — protocols ranked, the ranked set's total TVL,
how many protocols sit in a likely-open snapshot window, and the median airdrop estimate — over a
radar motif drawn in the gradient. Below them sits a display-currency selector: USD, EUR, GBP,
JPY, CNY, IDR and KRW. The rates are constants baked into `data.js` at build time (`FX` in
`lib/model.ts`, from exchangerate-api.com's public table of 2026-11-15), so the page stays fully
offline, and conversion is display only: every figure is converted at render time by the one
formatter, zero-decimal currencies show no cents, and ranking, sorting and all model maths stay
in USD — the selector's own note on the page says exactly that. Percentages, multiples and the
airdrop score never convert. The farm plans are part of `board.json` and keep the dollar amounts
the model wrote into them.

## Running it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Deterministic: the same snapshot always writes the same bytes. An implied value is this model's
claim about a launch that has not happened, made from the snapshot alone — not a prediction that a
token will exist, and not a price. The airdrop likelihood is the same kind of claim about a drop
that has not been announced.
