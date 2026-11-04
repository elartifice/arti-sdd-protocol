import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { costStudy, priceGroup, promptTier, routingStudy, routingTarget } from '../dev/cost-study.mjs';

const published = JSON.parse(fs.readFileSync(new URL('../docs/routing-cost-study.json', import.meta.url)));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const group = (extra = {}) => ({ sample: 'A1', provider: 'anthropic', context: 'worker', role: 'worker',
  role_basis: 'declared-role', model: 'claude-opus-5-5', prompt_band: 'up-to-100k', requests: 1,
  input: 1000, cached: 2000, write_5m: 4000, write_1h: 0, output: 500, ...extra });
const fixture = groups => ({ schema_version: 1, groups, role_models: published.role_models,
  rates_usd_per_million: published.rates_usd_per_million, expected: {} });

test('routing replay preserves the original captured workload and independently priced totals', () => {
  const old = costStudy(), next = routingStudy();
  assert.equal(next.counts.requests, 11134);
  assert.equal(next.counts.identified_worker_requests + next.counts.unclassified_worker_requests, next.counts.worker_requests);
  near(next.scenarios.observed.totals_usd.all, old.all.actual_usd);
  near(next.scenarios.all_flagship.totals_usd.all, old.all.baseline_usd);
  near(next.scenarios.identified_worker_fix.totals_usd.all, 1034.458348305);
  near(next.scenarios.worker_fix_assuming_implementation.totals_usd.all, 921.077310705);
  near(next.scenarios.full_profile_assuming_implementation.totals_usd.all, 752.474014405);
  assert.equal(next.token_savings_claimed, false);
});

test('replacement-model pricing uses the target context tier and each token category', () => {
  const rates = published.rates_usd_per_million;
  near(priceGroup({ ...group(), model: 'claude-sonnet-5-5', tier: 'standard' }, 'claude-sonnet-5-5', rates), 0.0172);
  const tokens = { model: 'claude-haiku-5-5', input: 100001, cached: 0, write_5m: 0, write_1h: 0, output: 1000 };
  assert.equal(promptTier(tokens.model, '100k-to-272k'), 'over-100k');
  near(priceGroup({ ...tokens, tier: 'over-100k' }, tokens.model, rates), 0.0525005);
  near(priceGroup({ ...tokens, input: 100000, tier: 'standard' }, tokens.model, rates), 0.0105);
  assert.equal(promptTier('claude-opus-5-5', 'over-272k'), 'standard');
  assert.equal(promptTier('gpt-6.1-terra', '100k-to-272k'), 'standard');
  const openai = { ...tokens, model: 'gpt-6.1-terra', input: 272001, tier: 'over-272k' };
  near(priceGroup(openai, openai.model, rates), 0.551502);
  near(priceGroup({ ...openai, input: 272000, tier: 'standard' }, openai.model, rates), 0.277);
});

test('unclassified work stays unchanged unless the implementation assumption is selected', () => {
  const g = group({ role: 'unclassified', role_basis: 'unclassified' });
  assert.equal(routingTarget(g, 'identified_worker_fix', published), g.model);
  assert.equal(routingTarget(g, 'full_identified_profile', published), g.model);
  assert.equal(routingTarget(g, 'worker_fix_assuming_implementation', published), 'claude-sonnet-5-5');
  const reviewer = group({ role: 'redteam' });
  assert.equal(routingTarget(reviewer, 'worker_fix_assuming_implementation', published), 'claude-opus-5-5');
  const coordinator = group({ provider: 'openai', context: 'coordinator', role: 'conductor', model: 'gpt-6-astra' });
  assert.equal(routingTarget(coordinator, 'identified_worker_fix', published), 'gpt-6-astra');
  assert.equal(routingTarget(coordinator, 'full_identified_profile', published), 'gpt-6.1-sol');
  const result = routingStudy(fixture([g, reviewer]));
  near(result.scenarios.observed.totals_usd.all, result.scenarios.identified_worker_fix.totals_usd.all);
});

test('malformed roles, provider changes, invalid counts and published drift fail clearly', () => {
  for (const g of [group({ role: 'missing-role' }), group({ requests: -1 }), group({ input: NaN }),
    group({ prompt_band: 'unknown' }), group({ provider: 'openai' }), group({ role_basis: 'unclassified' })]) {
    assert.throws(() => routingStudy(fixture([g])), /Cost study:/);
  }
  const crossed = fixture([group()]);
  crossed.role_models = structuredClone(crossed.role_models);
  crossed.role_models['claude-code'].worker = 'gpt-6.1-terra';
  assert.throws(() => routingStudy(crossed), /cross-provider/);
  const drift = fixture([group()]); drift.expected = { counts: { requests: 99 } };
  assert.throws(() => routingStudy(drift), /drifted/);
});
