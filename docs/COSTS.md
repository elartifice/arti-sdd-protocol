# Counted tokens, public prices: the expanded local cost study

The custom-agent design lets a coordinator delegate bounded work and choose models per role. Separate worker contexts keep detailed investigation out of the main conversation, while shared files retain decisions and lessons. See the [reporting hierarchy](assets/agent-architecture.svg). Spawning also creates requests; forks can copy history, so delegation does not guarantee fewer tokens. See [Claude subagents](https://code.claude.com/docs/en/sub-agents) and [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Result

**The recorded model mix prices at $1,079.47 versus $2,545.80 on the project's highest used models throughout: an estimated $1,466.34, or 57.6%, reduction.** This covers 11,134 requests in 17 historical ticket-linked captures from one project, including captured coordinators and native descendants. The source project and transcripts stay private.

| Cohort | Captures | Requests | All-flagship baseline | Recorded mix | Estimated reduction | Saving |
|---|---:|---:|---:|---:|---:|---:|
| Claude | 12 | 5,616 | $564.32 | $558.54 | $5.77 | 1.0% |
| Codex | 5 | 5,518 | $1,981.48 | $520.92 | $1,460.56 | 73.7% |
| **Combined** | **17** | **11,134** | **$2,545.80** | **$1,079.47** | **$1,466.34** | **57.6%** |

These are **USD API-equivalent token costs**, using standard global public prices checked on **2026-11-03**, not invoices or subscription charges. Totals and percentages use unrounded values. The baseline is Opus 5.5 for Claude and Astra for Codex, the highest models actually used in these project captures, not an assumption of equivalence between vendors.

## What explains the difference?

The larger sample contains substantial Sol-based Codex work. Three Codex captures are 85.1–88.2% below Astra pricing for the same recorded tokens; two used Astra throughout and save 0%. The Claude histories are Opus-heavy: 589 of 688 worker requests (**85.6%**) used Opus, and seven of twelve captures have no model-price saving at all.

Two comparisons answer different questions:

| Reference workload | Actual worker cost | Reference worker cost | Estimated saving |
|---|---:|---:|---:|
| Price every worker as its provider's project flagship | $265.88 | $1,004.34 | 73.5% |
| Price workers as their own capture's coordinator model | $265.88 | $270.65 | 1.8% |

Every captured Codex worker used the same model as its coordinator. For the second row, a capture with several coordinator models uses its highest-priced observed coordinator model as the reference. Only the worker rates change; coordinator costs are outside both worker-only columns.

The **57.6% headline measures the recorded model mix against always using the project flagships**. Most of that difference is whole-thread Sol/Astra choice. It must not be described as a saving caused by spawning subagents, or as measured ROI for the released v0.4.0 role profile. The historical records do not show extensive cheaper-than-coordinator routing. The released [role profile](AGENT-SETUP.md#models-and-effort-per-role) provides explicit cheaper scout/implementation bindings; its separate qualification proves invocation and bounded task suitability, not this cost outcome on future projects.

## Input size, not context-window capacity

| Requests | Average worker input | Average coordinator input | Worker input smaller by |
|---|---:|---:|---:|
| Claude | 92,787 tokens | 323,987 tokens | 71.4% |
| Codex | 182,994 tokens | 214,860 tokens | 14.8% |
| Combined | 165,736 tokens | 286,202 tokens | 42.1% |

Input includes uncached input, cache reads and cache writes. Roles did different work; this is an observation, not a controlled compression test. Configured context-window capacity is unchanged, and total token reduction was not measured.

## How captures were selected

The histories span **2026-10-27 through 2026-11-03**. “Ticket-linked capture” means a session or root-thread family associated with ticket work; one may discuss several tickets, and one ticket may span captures. This is not seventeen distinct, completely accounted tickets.

- **Claude:** take the ten most recently active independent session families in the canonical project context that have native child logs and ticket references. Keep the original A1/A2 captures for continuity. Join fork files sharing provider request IDs before selection, so copied history counts once. Same-model and zero-saving cases stay included.
- **Codex:** include all five root threads opened from the canonical project checkout and all discoverable descendants, across both Sol and Astra. Temporary harness/worktree roots are outside this sample. Discovery uses the actual first session metadata; copied parent metadata inside a fork does not turn a child into a root.
- **Privacy and scope:** this is an availability-based sample of historical workflows that informed Arti, not a random project portfolio or a trial of the released package. Only anonymous model/tier aggregates are public. Source hashes, actual ticket links, native IDs and request-level usage ledgers remain local.

## Per-capture results

| Capture | Requests | All-flagship baseline | Recorded mix | Estimated saving |
|---|---:|---:|---:|---:|
| A1 | 222 | $28.26 | $26.60 | 5.9% |
| A2 | 307 | $28.78 | $28.37 | 1.4% |
| A3 | 1,078 | $131.92 | $130.55 | 1.0% |
| A4 | 1,000 | $116.70 | $116.70 | 0.0% |
| A5 | 416 | $35.63 | $35.63 | 0.0% |
| A6 | 276 | $27.82 | $27.82 | 0.0% |
| A7 | 324 | $22.07 | $22.07 | 0.0% |
| A8 | 725 | $55.62 | $54.30 | 2.4% |
| A9 | 258 | $26.16 | $25.16 | 3.8% |
| A10 | 300 | $22.80 | $22.80 | 0.0% |
| A11 | 218 | $16.90 | $16.90 | 0.0% |
| A12 | 492 | $51.65 | $51.65 | 0.0% |
| C1 | 1,279 | $279.54 | $279.54 | 0.0% |
| C2 | 94 | $38.54 | $38.54 | 0.0% |
| C3 | 1,579 | $642.96 | $75.95 | 88.2% |
| C4 | 2,523 | $1,009.55 | $125.27 | 87.6% |
| C5 | 43 | $10.90 | $1.62 | 85.1% |

## Token counts used

All values below are actual token counts, before applying price multipliers. `input` is uncached input; `read` is cached input. The JSON keeps coordinator and worker counts separate as well.

| Model | Request tier | Requests | Input | Read | Write 5m | Write 1h | Output |
|---|---|---:|---:|---:|---:|---:|---:|
| opus-5-5 | standard | 5,498 | 11,682 | 1,635,696,293 | 2,634,878 | 14,688,069 | 4,886,293 |
| haiku-5-5 | standard | 37 | 76 | 1,803,210 | 262,169 | 0 | 63,170 |
| sonnet-5-5 | standard | 80 | 164 | 4,789,338 | 342,505 | 115,816 | 106,129 |
| haiku-5-5 | over-100k | 1 | 2 | 99,672 | 680 | 0 | 2,325 |
| GPT-6-astra | standard | 1,317 | 5,344,184 | 185,707,136 | 0 | 0 | 722,699 |
| GPT-6-astra | over-272k | 56 | 408,497 | 16,051,200 | 0 | 0 | 33,652 |
| GPT-6.1-sol | standard | 2,903 | 9,080,490 | 445,608,064 | 0 | 0 | 1,855,142 |
| GPT-6.1-sol | over-272k | 1,242 | 4,334,149 | 426,398,720 | 0 | 0 | 1,263,388 |

## Public prices and arithmetic

Standard global USD per million tokens:

| Model | Uncached input | Cache read | 5-minute write | 1-hour write | Output |
|---|---:|---:|---:|---:|---:|
| Claude Opus 5.5 | $4.00 | $0.20 | $5.00 | $8.00 | $20.00 |
| Claude Sonnet 5.5 | $2.00 | $0.10 | $2.50 | $4.00 | $10.00 |
| Claude Haiku 5.5, input ≤100K | $0.10 | $0.01 | $0.125 | $0.20 | $0.50 |
| GPT-6.1 Sol, input ≤272K | $2.00 | $0.10 | — | — | $10.00 |
| GPT-6 Astra, input ≤272K | $10.00 | $1.00 | — | — | $50.00 |

Sources: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Sol pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Astra pricing](https://developers.openai.com/api/docs/models/gpt-6-astra). Haiku requests above 100K input use 5× its listed rates. OpenAI requests above 272K input use 2× input/cache rates and 1.5× output rates for the full request. Those tiers are applied per request before aggregation. All captured Codex cache-write counters are zero; the dashes do not mean OpenAI has no write pricing. API repricing is separate from subscription accounting.

```text
cost = sum(tokens_of_each_type × public_rate_for_that_model_and_tier) / 1,000,000
saving_percent = 100 × (1 − sum(recorded_mix_cost) / sum(all_flagship_cost))
```

Token counts, context tiers, cache categories, task mix and request count stay fixed. Only the model prices change in the baseline. Another model might change output length, retries, cache behaviour and quality; those effects were not tested. Percentages are weighted by total dollar cost, not averaged across tickets.

## Accounting and remaining gaps

- **Claude:** deduplicate provider message IDs across streamed chunks and copied fork files; keep the maximum observed output counter. Uncached input, cache reads, 5-minute/1-hour writes and output remain separate. Iteration breakdowns and thinking counters are not added again. The captures report standard/global inference, and no request ID overlaps another selected family.
- **Codex:** identify the real owning thread from its first metadata record, map descendants to roots, and count each advancing usage counter once. Each file's summed request usage reconciles to its final cumulative counters. Cached input is subtracted from inclusive input before pricing. Reasoning output is already included in output.
- **Coverage gaps:** only the captured coordinator/native-worker processes are priced. Separate external CLI review processes without complete attributable model/request usage, uncaptured sessions, non-token tool charges, taxes, subscription fees and labour are excluded from both columns. These are not total ticket bills. The missing work could change an end-to-end saving percentage.

Recompute from the [anonymous aggregate data](cost-study.json), without credentials, network access or private transcripts:

```sh
node dev/cost-study.mjs
```

`npm run check` verifies the independently calculated published totals. The helper and dataset stay outside the installable skill. A stronger future benchmark would capture every coordinator, worker and cross-lab review request and compare representative tickets under the same quality gate, including retries, latency and acceptance outcomes.
