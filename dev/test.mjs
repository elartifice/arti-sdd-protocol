import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = fs.existsSync('tests') ? fs.readdirSync('tests').filter(x => x.endsWith('.test.mjs')).sort().map(x => `tests/${x}`) : [];
if (!files.length) { console.error('No test files found'); process.exit(1); }
const childEnv={...process.env,NO_COLOR:'1'};
delete childEnv.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: childEnv });
process.exit(result.status ?? 1);
