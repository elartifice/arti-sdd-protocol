// Reprice the public, anonymised token aggregates; no transcripts or network access.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const fields = ['input', 'cached', 'write_5m', 'write_1h', 'output'];
function requireValue(ok, message) { if (!ok) throw new Error(`Cost study: ${message}`); }
function comparison(actual_usd, baseline_usd) {
  requireValue(baseline_usd > 0, 'empty baseline');
  return { actual_usd, baseline_usd, saved_usd: baseline_usd - actual_usd,
    saving_percent: 100 * (1 - actual_usd / baseline_usd) };
}

export function costStudy(data = JSON.parse(fs.readFileSync(new URL('../docs/cost-study.json', import.meta.url)))) {
  const totals = { delegated: [0, 0], control: [0, 0], all: [0, 0], workers: [0, 0] };
  const contexts = { coordinator: [0, 0], worker: [0, 0] };
  function price(group, model) {
    requireValue(group.tier === 'standard', 'this captured sample uses standard-context requests only');
    const rates = data.rates_usd_per_million[model];
    requireValue(rates, `unknown model ${model}`);
    return fields.reduce((sum, field) => {
      const tokens = group[field], rate = rates[field];
      requireValue(Number.isSafeInteger(tokens) && tokens >= 0, `invalid ${field}`);
      requireValue(tokens === 0 || (Number.isFinite(rate) && rate >= 0), `missing ${field} price for ${model}`);
      return sum + tokens * (rate ?? 0) / 1e6;
    }, 0);
  }
  const ids = new Set();
  const samples = data.samples.map(sample => {
    requireValue(!ids.has(sample.id), 'duplicate sample'); ids.add(sample.id);
    requireValue(['delegated', 'control'].includes(sample.category), 'unknown category');
    let actual = 0, baseline = 0, requests = 0;
    for (const group of sample.groups) {
      requireValue(Number.isSafeInteger(group.requests) && group.requests > 0, 'invalid request count');
      const a = price(group, group.model), b = price(group, sample.baseline);
      actual += a; baseline += b; requests += group.requests;
      if (sample.category === 'delegated') {
        const context = contexts[group.context]; requireValue(context, 'unknown context');
        context[0] += fields.slice(0, -1).reduce((sum, field) => sum + group[field], 0);
        context[1] += group.requests;
        if (group.context === 'worker') { totals.workers[0] += a; totals.workers[1] += b; }
      }
    }
    for (const key of [sample.category, 'all']) { totals[key][0] += actual; totals[key][1] += baseline; }
    return { id: sample.id, category: sample.category, requests, ...comparison(actual, baseline) };
  });
  const result = Object.fromEntries(Object.entries(totals).map(([key, values]) => [key, comparison(...values)]));
  const worker = contexts.worker[0] / contexts.worker[1], coordinator = contexts.coordinator[0] / contexts.coordinator[1];
  result.context = { worker_input_per_request: worker, coordinator_input_per_request: coordinator,
    smaller_percent: 100 * (1 - worker / coordinator) };
  // Expected totals were calculated independently from the private request ledger.
  // Changes must also reconcile the figures and caveats in docs/COSTS.md.
  for (const [section, expected] of Object.entries(data.expected)) {
    for (const [key, value] of Object.entries(expected)) {
      requireValue(Number.isFinite(value) && Math.abs(result[section]?.[key] - value) < 1e-8, `published ${section}.${key} drifted`);
    }
  }
  return { as_of: data.as_of, samples, ...result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(costStudy(), null, 2));
