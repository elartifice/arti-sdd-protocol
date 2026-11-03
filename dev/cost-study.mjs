// Reprice public token aggregates; no transcripts, credentials or network access.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const fields = ['input', 'cached', 'write_5m', 'write_1h', 'output'];
function requireValue(ok, message) { if (!ok) throw new Error(`Cost study: ${message}`); }
function comparison(actual_usd, baseline_usd) {
  requireValue(Number.isFinite(actual_usd) && baseline_usd > 0, 'empty or invalid baseline');
  return { actual_usd, baseline_usd, saved_usd: baseline_usd - actual_usd,
    saving_percent: 100 * (1 - actual_usd / baseline_usd) };
}

export function priceGroup(group, model, rates) {
  requireValue(rates[model], `unknown model ${model}`);
  requireValue(model.startsWith('claude-') === group.model.startsWith('claude-'), 'cross-provider baseline');
  requireValue(['standard', 'over-100k', 'over-272k'].includes(group.tier), 'unknown context tier');
  if (group.tier === 'over-100k') requireValue(group.model === 'claude-haiku-5-5', 'invalid Haiku context tier');
  if (group.tier === 'over-272k') requireValue(group.model.startsWith('gpt-'), 'invalid OpenAI context tier');
  return fields.reduce((sum, field) => {
    const tokens = group[field], rate = rates[model][field];
    requireValue(Number.isSafeInteger(tokens) && tokens >= 0, `invalid ${field}`);
    requireValue(tokens === 0 || (Number.isFinite(rate) && rate >= 0), `missing ${field} price for ${model}`);
    let scale = 1;
    if (group.tier === 'over-272k') scale = field === 'output' ? 1.5 : 2;
    if (group.tier === 'over-100k' && model === 'claude-haiku-5-5') scale = 5;
    return sum + tokens * (rate ?? 0) * scale / 1e6;
  }, 0);
}

export function costStudy(data = JSON.parse(fs.readFileSync(new URL('../docs/cost-study.json', import.meta.url)))) {
  const totals = Object.fromEntries(['claude', 'codex', 'all', 'workers', 'workers_vs_coordinator'].map(key => [key, [0, 0]]));
  const contexts = Object.fromEntries(['claude', 'codex', 'all'].map(key => [key, { coordinator: [0, 0], worker: [0, 0] }]));
  const ids = new Set(), workerModels = {}, counts = { captures: data.samples.length, claude_requests: 0, codex_requests: 0 };
  const samples = data.samples.map(sample => {
    requireValue(!ids.has(sample.id), 'duplicate sample'); ids.add(sample.id);
    requireValue(['anthropic', 'openai'].includes(sample.provider), 'unknown provider');
    const cohort = sample.provider === 'anthropic' ? 'claude' : 'codex';
    let actual = 0, baseline = 0, requests = 0;
    for (const group of sample.groups) {
      requireValue(Number.isSafeInteger(group.requests) && group.requests > 0, 'invalid request count');
      requireValue(['worker', 'coordinator'].includes(group.context), 'unknown context');
      requireValue((sample.provider === 'anthropic') === group.model.startsWith('claude-'), 'provider mismatch');
      const a = priceGroup(group, group.model, data.rates_usd_per_million);
      const b = priceGroup(group, sample.baseline, data.rates_usd_per_million);
      actual += a; baseline += b; requests += group.requests;
      for (const key of [cohort, 'all']) {
        contexts[key][group.context][0] += fields.slice(0, -1).reduce((sum, field) => sum + group[field], 0);
        contexts[key][group.context][1] += group.requests;
      }
      if (group.context === 'worker') {
        totals.workers[0] += a; totals.workers[1] += b;
        totals.workers_vs_coordinator[0] += a;
        totals.workers_vs_coordinator[1] += priceGroup(group, sample.coordinator_baseline, data.rates_usd_per_million);
        workerModels[group.model] = (workerModels[group.model] ?? 0) + group.requests;
      }
    }
    counts[`${cohort}_requests`] += requests;
    for (const key of [cohort, 'all']) { totals[key][0] += actual; totals[key][1] += baseline; }
    return { id: sample.id, provider: sample.provider, requests, ...comparison(actual, baseline) };
  });
  const result = Object.fromEntries(Object.entries(totals).map(([key, values]) => [key, comparison(...values)]));
  result.context = Object.fromEntries(Object.entries(contexts).map(([key, values]) => {
    const worker = values.worker[0] / values.worker[1], coordinator = values.coordinator[0] / values.coordinator[1];
    return [key, { worker_input_per_request: worker, coordinator_input_per_request: coordinator,
      smaller_percent: 100 * (1 - worker / coordinator) }];
  }));
  result.counts = counts; result.worker_models = workerModels;
  // Independently calculated expected totals also pin the published figures.
  function verify(actual, expected, name = '') {
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'object') verify(actual?.[key], value, `${name}${key}.`);
      else requireValue(Number.isFinite(value) && Math.abs(actual?.[key] - value) < 1e-8, `published ${name}${key} drifted`);
    }
  }
  verify(result, data.expected);
  return { as_of: data.as_of, samples, ...result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(costStudy(), null, 2));
