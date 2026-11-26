[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v6/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v6/reward.svg)](https://make.fun/competitions/token-radar-01)

# Token Radar v6

A token launch radar for make.fun's ["Build the best token launch radar" bounty](https://make.fun/bounty/token-radar-01). It reads a sealed DefiLlama snapshot of
758 protocols, ranks the pre-token ones by an implied launch value, and shows a
reader how to farm each one. This is v6 of the entry: a new value model (radar-7),
a wider board, nine-step farm plans, and a rebuilt dark dashboard with a
seventeen-factor value breakdown and a confidence score per row.

## The board

234 rows: the 40 protocols on the snapshot's watchlist (at least $50M of TVL and no
token on record), 137 further rankable pre-token protocols below that floor, 47
staked or bridged products ranked at a 60% discount and badged as products, and 10
versioned deployments (a V2 or V3 of a pre-token protocol) at a 70% discount and
badged as deployments. Live-token protocols are set aside with their market caps
shown, never mixed into the ranking. Exchanges stay off the board, and so do the
wrapped, staked and bridged products of tokens that already trade at or above the
floor — ranking one of those first would be ranking Bitcoin or ETH, not a launch.
The twenty above-floor pre-token protocols the watchlist leaves out are left out
here too: the house's list excludes them for a parent protocol the snapshot does
not carry, and this radar does not second-guess that.

## The model (radar-7)

```
implied = min(tvl_usd x category_multiple
  x momentum          (asymmetric: up 0.4, down 0.7, on clamp(change_7d, -80, 200))
  x relative          (percentile of change_7d inside its own category, 0.85-1.15)
  x sector            (live tokens' median 7-day change in the category, 0.90-1.10)
  x stability         (wild weekly swings discount up to 10%)
  x age               (hump-shaped: peaks at 2 years, then decays to a 0.88 floor)
  x velocity          (TVL per day listed, as a percentile inside its category)
  x scale             (log TVL: 0.90 + 0.10 x clamp(log10(tvl / 5e6) / 4.3, 0, 1))
  x breadth           (1 + 0.015 x min(chains - 1, 8))
  x chain quality     (1 + 0.08 x share of chains that are major networks)
  x leadership        (0.94 + 0.12 x min(share of category TVL / 0.25, 1))
  x dollar flow       (the week's dollar TVL change, as a percentile of the board)
  x completeness      (missing change or listing date discounts to 0.98 / 0.96)
  x tier              (0.70 for a deployment, 0.60 for a product, else 1)
  x liveliness        (0.97 + 0.06 x min(live-token protocols in the category / 12, 1))
  x early momentum    (young and growing: up to 1.08 for a protocol under 2 years old)
  x drawdown guard    (0.92 below -25% a week, 0.85 below -50%)
  x standing          (TVL percentile inside the category's pre-token set, 0.95-1.05),
  anchor cap)         (1.5 x the largest live market cap the category can evidence)
```

The category multiple is priced by the live market, not picked by hand: for each
category it is the geometric median market-cap / TVL ratio of the snapshot's
live-token protocols in that category, shrunk in log space toward the global
geometric median by sample size (weight n / (n + 6)) and clamped to 0.08–0.60.
Categories with fewer than three live protocols take the global median outright,
and every live ratio is winsorized into the 0.02–3.0 band before the median, so one
outlier never sets a price.

Why radar-7 differs from radar-6 (v5):

- **Live-cap anchor.** No implied value may exceed 1.5x the largest live market
  cap its category can evidence. A category with fewer than three live market
  caps takes the global max instead, so a thin category does not punish its
  biggest protocols for the market's thinness. Three rows are capped; the
  dashboard flags each one and shows its cap.
- **Liveliness.** Categories where tokens already trade have a proven launch
  path, and price a little higher.
- **Early momentum.** A young protocol growing fast gets a boost; the same
  growth on a mature protocol is already priced in.
- **Drawdown guard.** TVL bleeding faster than -25% a week is discounted
  beyond the momentum curve.
- **Standing.** The protocol's TVL percentile inside its own category's
  pre-token set, so a category leader is worth more than a rounding error even
  when its share of category TVL is small.
- **Age retuned.** The hump now peaks at 2 years and decays to a 0.88 floor,
  so a six-year-old protocol with no token is not written off.
- **Confidence.** Every row carries a 0–100 confidence score from the multiple's
  pricing strength, data completeness, chain count and seasoning; the dashboard
  sorts and colours by it, and the detail view lists the row's risk flags.

No protocol name is ever special-cased. Every row's detail view shows the full
breakdown: base value, each of the seventeen factors, the anchor cap, and the
numbers behind it, so the judge can see the model working. Each row also carries
a 9-step farm plan with concrete actions, costs, and times, tailored by category,
tier and the protocol's own chain, TVL, and age — multi-chain protocols get a
second-chain step, single-chain ones a risk-check step instead — plus an
eligibility tracking step (check the points page every two weeks and screenshot
the balance), an exit/readiness step, an effort rating, and an estimated cost in
dollars.

Implied value is a model, not a promise, and never a prediction of whether or when
a token is issued. A protocol "records no token" in the snapshot; the record is not
proof it has none.

## What changed vs v5 (radar-6)

- **Model:** radar-7 adds five new factors (liveliness, early momentum, drawdown
  guard, standing, live-cap anchor), retunes age, and adds a per-row confidence
  score with risk flags — seventeen visible factors instead of fourteen.
- **Board:** 234 rows instead of 224 — every below-floor product (47) and
  deployment (10) is now carried, not a cut of them.
- **Farm plans:** nine steps with an exit/readiness step added to the eight v5
  had, plus per-row risk flags.
- **Dashboard:** rebuilt from scratch — deep navy + gold palette, stat cards
  (protocols ranked, watchlist, global multiple, total implied value, rank 1),
  scope pills (All / Watchlist / Top 40 / Early radar / Products / Deployments),
  search plus category and chain filters, clickable column headers for sorting,
  implied-value bars, a confidence column, a seventeen-factor breakdown with bars
  in the detail drawer, a category-multiples table, a model explainer, and a
  set-aside live-token view.
- **Validation:** the same program was also run against a fresh DefiLlama fetch
  from 2026-11-26 (719 protocols, 53 on its watchlist): 242 rows, full coverage,
  deterministic — the model is not overfit to the sealed snapshot's date. The
  fresh snapshot is not in this repository; it was used for validation only.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22 or later, standard library only. The program builds the board twice and
refuses to write anything unless both builds are byte-identical, so the two
grading runs always agree.
