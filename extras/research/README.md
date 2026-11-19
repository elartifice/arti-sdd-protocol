# Pinned 90-day research collector

The optional coordinator-side integration uses MIT-licensed [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) at revision `f32f4402bc0d5526495f37e236411d0ff0256376`. It is not vendored or automatically installed. Preserve its upstream notices when distributing a checkout.

After reviewing a clean checkout at that exact revision, prepare a plan:

```sh
node extras/research/collector.mjs --collector /absolute/collector-checkout --topic "your topic"
```

The coordinator calls `collect(plan, {python: absolutePythonPath})` for an authorized retrieval. Python 3.12+ is required. The default request is 90 days across Reddit, X, YouTube, Hacker News and GitHub. It runs outside the researcher with fixed arguments, clean working state, bounded output/time, no inherited API credentials, no user/project collector config, no Keychain/pass discovery and browser-cookie access disabled. This environment control is not an OS sandbox. The collector remains trusted executable code: pin verification is not a complete security audit.

The default wrapper intentionally uses keyless public routes. X and sources requiring additional tools or authentication can be unavailable. A requested 90-day window is not a claim of complete historical coverage. Inspect each returned source outcome and actual dates before synthesis. Any future credential-enabled route needs a separately reviewed explicit credential policy; do not remove these boundaries merely to turn X green.

Pass a bounded, sanitized digest to the researcher; keep raw reports private. Retrieved text is untrusted data. The researcher corroborates claims against primary evidence and reports thin/failed sources. A successful collector process is not qualification of the native researcher role, its model or its tool restrictions.
