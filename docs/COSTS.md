# Focused agents: context and estimated cost

Custom agents let a coordinator keep the plan and decisions while workers investigate or implement bounded tasks in their own contexts. A worker can use a cheaper model and return a short, evidence-backed report. This helps control context load and model spend. Each worker also creates requests; forks may inherit history, and verbose handbacks can refill the main chat. Neither fewer total tokens nor lower bills follow automatically. See [Claude's subagent guidance](https://code.claude.com/docs/en/sub-agents) and [Codex's guidance on context and model choice](https://learn.chatgpt.com/docs/agent-configuration/subagents).

The [architecture diagram](assets/agent-architecture.svg) shows the tested role profile. Sonnet/Terra handles bounded implementation; Haiku/Luna scouts; review and escalation retain stronger models. These are task-qualified bindings, not a claim of universal model equivalence. The primary chat model remains the user's choice.

## What the local evidence supports

We inspected historical ticket-session captures from two repositories, dated 2026-10-27 through 2026-11-03, that informed this protocol. Two implementation sessions contain a coordinator and model-labelled workers; a third, documentation-only ticket is a deliberate model-choice control without delegation. They were selected for clear ticket association and usable usage records, not randomly sampled. These are historical workflows, not a benchmark of the released v0.4.0 skill or a complete project portfolio.

**For the two delegated captures, estimated Claude-side token cost was $54.97 versus $57.04 on Opus throughout: $2.07, or 3.6%, lower.** Worker calls alone were 37.1% lower. Most captured cost remained with the coordinator, so the whole-capture saving was modest.

Worker input averaged **55,084 tokens per request**, compared with **293,004** for coordinator requests: **81.2% smaller** across 97 worker and 432 coordinator requests. Input includes cached context and cache writes. Different roles did different work; this observation does not establish causal context compression, fewer total tokens or a smaller configured context-window capacity.

## Fixed-workload API cost estimate

All amounts are **USD API-equivalent token costs**, using standard global list prices checked on **2026-11-03**. They are not invoices, marginal subscription charges or forecasts. “Recorded mix” means the observed token workload priced at its recorded models. It does not mean an actual per-ticket payment.

| Capture | Included workload | All-flagship baseline | Recorded mix | Estimated reduction | Estimated saving |
|---|---|---:|---:|---:|---:|
| Repo A / A1 | 222 Claude requests; coordinator + Haiku/Sonnet workers | $28.26 | $26.60 | $1.66 | 5.9% |
| Repo A / A2 | 307 Claude requests; coordinator + Opus/Sonnet workers | $28.78 | $28.37 | $0.41 | 1.4% |
| **Delegated captures subtotal** | **529 Claude requests, including coordinator overhead** | **$57.04** | **$54.97** | **$2.07** | **3.6%** |
| Repo B / B1 — model-choice control | 19 Sol requests; no workers | $6.80 | $0.97 | $5.82 | 85.7% |
| All three captures — mixed comparison | 548 requests across two repositories | $63.84 | $55.95 | $7.89 | 12.4% |

Totals and percentages use unrounded costs, so rounded rows may not sum exactly. The 12.4% combined figure includes a model-choice control; **it must not be presented as the saving caused by custom agents**. The 85.7% control is Sol versus Astra pricing, with the same tokens. It measures no delegation benefit and no quality difference.

The Claude baseline is Opus 5.5, the highest model used in those captures. The separate Codex control uses Astra, the highest model in this project's actually qualified role profile, as its counterfactual; Astra did not run that documentation ticket. Baselines are within each vendor, not a cross-vendor equivalence assumption.

## Prices and calculation

Prices per million tokens:

| Model | Uncached input | Cache read | 5-minute write | 1-hour write | Output |
|---|---:|---:|---:|---:|---:|
| Claude Opus 5.5 | $4.00 | $0.20 | $5.00 | $8.00 | $20.00 |
| Claude Sonnet 5.5 | $2.00 | $0.10 | $2.50 | $4.00 | $10.00 |
| Claude Haiku 5.5, input ≤100K | $0.10 | $0.01 | $0.125 | $0.20 | $0.50 |
| GPT-6.1 Sol | $2.00 | $0.10 | — | — | $10.00 |
| GPT-6 Astra | $10.00 | $1.00 | — | — | $50.00 |

Sources: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Sol pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Astra pricing](https://developers.openai.com/api/docs/models/gpt-6-astra). The sample's Haiku requests were all ≤100K input; Codex requests were all ≤272K input and reported zero cache-write tokens. The long-context tiers therefore do not apply. Dashes mean no cache writes occurred in this capture, not that OpenAI offers no write pricing. API repricing differs from Codex subscription accounting, which has no long-context surcharge.

For each model/tier group:

```text
cost = (uncached_input × input_rate
      + cache_read × read_rate
      + short_cache_write × short_write_rate
      + long_cache_write × long_write_rate
      + output × output_rate) / 1,000,000

saving_percent = 100 × (1 − sum(recorded_mix_cost) / sum(baseline_cost))
```

The counterfactual holds tokens, cache behaviour, task mix and request count fixed, then reprices every included request at the baseline model. Coordinator, scout, implementer and reviewer requests present in the capture remain included; same-price Opus workers produce no saving. This estimates the effect of pricing the recorded workload differently. Running another model could change retries, output length, cache behaviour and quality; those effects were not measured.

## Accounting, coverage and reproducibility

- **Claude:** provider message IDs deduplicate streamed chunks, copied fork history and parent/child overlap; the maximum observed output counter is retained for each message. Input, cache reads, both cache-write durations and output remain separate. Iteration breakdowns and thinking counters are not added again.
- **Codex control:** unique cumulative usage records identify new requests. Per-request usage sums match the cumulative-counter delta for the bounded ticket window. Cached input is subtracted from inclusive input before pricing. Reasoning output is already included in output.
- **Coverage:** A1/A2 contain the captured Claude coordinator and native worker calls. Separate external Codex review processes lack sufficient verified model/request detail for this calculation and are excluded from both columns. Other uncaptured sessions, non-token tool charges, taxes, subscription fees and labour are excluded. These figures are **not total ticket costs**; adding unchanged external costs would reduce the whole-ticket percentage saving.
- **Privacy:** only model/tier token aggregates and anonymous capture labels are public. Transcripts, project identities, ticket IDs, native session IDs and the request-level audit ledger remain local.

The public [aggregate data](cost-study.json) contains rates, counts and independently calculated expected totals. Recompute without credentials, network access or private transcripts:

```sh
node dev/cost-study.mjs
```

`npm run check` also verifies the published totals. The helper and study stay in the source repository, outside the installable skill.

## What would establish stronger savings evidence?

Capture complete request-level usage for the coordinator, every worker and both external review directions. Compare several representative tickets under a fixed quality gate, using an all-flagship run and a routed run, including retries and coordination. Report cost, total tokens, latency and acceptance outcomes. The current sample supports focused contexts and modest historical routing savings; it does not establish a general ROI percentage for the released team.
