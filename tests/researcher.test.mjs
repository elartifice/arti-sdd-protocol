import test from 'node:test';
import assert from 'node:assert/strict';
import {roles,roleText,nativeRole,validateTeam} from '../.agents/skills/arti-sdd-protocol/scripts/team.mjs';
import {mapping} from './harness.mjs';
test('researcher receives supplied context, explicit models and web-only Claude tools; unknown or mixed tools refuse',()=>{
 const team=mapping();team.enabled_roles.push('researcher');for(const h of ['claude','codex'])team.bindings[h].researcher={...team.bindings[h].scout};
 validateTeam(team,['claude','codex']);const text=roleText('researcher');assert.ok(!text.includes('Read AGENTS.md'));assert.ok(text.includes('90 days'));
 const claude=nativeRole('claude','researcher',team.bindings.claude.researcher,text);assert.ok(claude.includes('tools: WebSearch, WebFetch'));assert.ok(claude.includes('disallowedTools: Agent, Read'));
 const before=[...roles.researcher.tools];try{roles.researcher.tools.push('UnknownTool');assert.throws(()=>validateTeam(team,['claude']),/Unknown tools/);roles.researcher.tools=['WebFetch','Read'];assert.throws(()=>validateTeam(team,['claude']),/Mixed web/);}finally{roles.researcher.tools=before;}
 delete team.bindings.codex.researcher;assert.throws(()=>validateTeam(team,['codex']),/Unresolved/);
});
