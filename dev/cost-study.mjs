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

export function promptTier(model, band) {
  requireValue(['up-to-100k', '100k-to-272k', 'over-272k'].includes(band), 'unknown prompt band');
  return model === 'claude-haiku-5-5' && band !== 'up-to-100k' ? 'over-100k'
    : model.startsWith('gpt-') && band === 'over-272k' ? 'over-272k' : 'standard';
}

export function routingTarget(group, scenario, data) {
  requireValue(['observed', 'all_flagship', 'identified_worker_fix', 'worker_fix_assuming_implementation',
    'full_identified_profile', 'full_profile_assuming_implementation'].includes(scenario), 'unknown routing scenario');
  const host = group.provider === 'anthropic' ? 'claude-code' : 'codex';
  const models = data.role_models[host];
  if (scenario === 'observed') return group.model;
  if (scenario === 'all_flagship') return host === 'claude-code' ? 'claude-opus-5-5' : 'gpt-6-astra';
  if (group.context === 'coordinator') return scenario.startsWith('full_') ? models.conductor : group.model;
  if (group.role !== 'unclassified') {
    requireValue(Object.hasOwn(models, group.role), 'unmapped declared role');
    return models[group.role];
  }
  return scenario.endsWith('assuming_implementation') ? models.worker : group.model;
}

export function routingStudy(data = JSON.parse(fs.readFileSync(new URL('../docs/routing-cost-study.json', import.meta.url)))) {
  const names = ['observed', 'all_flagship', 'identified_worker_fix', 'worker_fix_assuming_implementation',
    'full_identified_profile', 'full_profile_assuming_implementation'];
  requireValue(data.schema_version === 1 && Array.isArray(data.groups) && data.groups.length > 0, 'invalid routing dataset');
  const scenarios = Object.fromEntries(names.map(name => [name, { totals_usd: { all: 0, claude: 0, codex: 0, workers: 0 }, samples_usd: {} }]));
  const counts = { requests: 0, coordinator_requests: 0, worker_requests: 0, identified_worker_requests: 0, unclassified_worker_requests: 0 };
  const roles = {}, role_basis = {}, input_tokens = { coordinator: 0, worker: 0 };
  for (const group of data.groups) {
    requireValue(['anthropic', 'openai'].includes(group.provider), 'unknown routing provider');
    requireValue(['coordinator', 'worker'].includes(group.context), 'unknown routing context');
    requireValue(Number.isSafeInteger(group.requests) && group.requests > 0, 'invalid routing request count');
    requireValue(typeof group.model === 'string' && (group.provider === 'anthropic') === group.model.startsWith('claude-'), 'routing provider mismatch');
    requireValue(['coordinator-context', 'declared-role', 'named-task-intent', 'unclassified'].includes(group.role_basis), 'unknown role evidence');
    requireValue(group.context !== 'coordinator' || (group.role === 'conductor' && group.role_basis === 'coordinator-context'), 'invalid coordinator identity');
    requireValue((group.role === 'unclassified') === (group.role_basis === 'unclassified'), 'inconsistent role evidence');
    counts.requests += group.requests; counts[group.context + '_requests'] += group.requests;
    if (group.context === 'worker') counts[group.role === 'unclassified' ? 'unclassified_worker_requests' : 'identified_worker_requests'] += group.requests;
    roles[group.role] = (roles[group.role] ?? 0) + group.requests;
    role_basis[group.role_basis] = (role_basis[group.role_basis] ?? 0) + group.requests;
    for (const field of fields) requireValue(Number.isSafeInteger(group[field]) && group[field] >= 0, `invalid routing ${field}`);
    input_tokens[group.context] += fields.slice(0, -1).reduce((n, field) => n + group[field], 0);
    for (const name of names) {
      const model = routingTarget(group, name, data);
      requireValue(typeof model === 'string' && (group.provider === 'anthropic') === model.startsWith('claude-'), 'cross-provider routing');
      const price = priceGroup({ ...group, model, tier: promptTier(model, group.prompt_band) }, model, data.rates_usd_per_million);
      const row = scenarios[name], cohort = group.provider === 'anthropic' ? 'claude' : 'codex';
      row.totals_usd.all += price; row.totals_usd[cohort] += price;
      if (group.context === 'worker') row.totals_usd.workers += price;
      row.samples_usd[group.sample] = (row.samples_usd[group.sample] ?? 0) + price;
    }
  }
  const result = { counts, roles, role_basis, input_tokens, scenarios };
  function verify(actual, expected, name = '') {
    for (const [key, value] of Object.entries(expected)) {
      if (value && typeof value === 'object') verify(actual?.[key], value, `${name}${key}.`);
      else requireValue(Number.isFinite(value) && Math.abs(actual?.[key] - value) < 1e-8, `published routing ${name}${key} drifted`);
    }
  }
  verify(result, data.expected);
  const observed = scenarios.observed.totals_usd.all, baseline = scenarios.all_flagship.totals_usd.all;
  for (const row of Object.values(scenarios)) {
    row.versus_observed = comparison(row.totals_usd.all, observed);
    row.versus_all_flagship = comparison(row.totals_usd.all, baseline);
  }
  return { as_of: data.as_of, token_savings_claimed: false, ...result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(process.argv.includes('--routing') ? routingStudy() : costStudy(), null, 2));
