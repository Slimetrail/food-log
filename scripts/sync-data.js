#!/usr/bin/env node
// Copy research data from /workspace/mediterranean-research into data/ and write data/index.json.
// Usage: node scripts/sync-data.js [researchDir]
// Missing files are simply left out; the app shows "coming from research" empty states for them.
const fs = require('fs'), path = require('path');
const SRC = process.argv[2] || '/workspace/mediterranean-research';
const OUT = path.join(__dirname, '..', 'data');
const FILES = ['foods.json', 'meals.json', 'groups.json', 'weekly-plan.json', 'meal-timing.json', 'alternatives.json', 'questionnaire.json', 'habits.json', 'hydration.json', 'targets.json', 'medas.json', 'pace.json', 'grocery-lists.json'];
const SEED = path.join(__dirname, '..', 'data-seed');
fs.mkdirSync(OUT, { recursive: true });
const files = {}; const versions = [];
for (const f of FILES) {
  let src = path.join(SRC, f); const dst = path.join(OUT, f);
  if (!fs.existsSync(src) && fs.existsSync(path.join(SEED, f))) { src = path.join(SEED, f); console.log('using seed for', f); }
  if (!fs.existsSync(src)) { if (fs.existsSync(dst)) fs.unlinkSync(dst); continue; }
  let j; try { j = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { console.error('SKIP (invalid JSON):', f, e.message); continue; }
  fs.writeFileSync(dst, JSON.stringify(j));
  files[f] = { version: j.version ?? null, revision: j.revision ?? null, bytes: fs.statSync(dst).size };
  if (j.version != null) versions.push(String(j.version));
  console.log('copied', f, 'version', j.version ?? '-', 'revision', j.revision ?? '-');
}
const crypto = require('crypto');
const hash = crypto.createHash('sha1').update(Object.keys(files).map(f => fs.readFileSync(path.join(OUT, f))).join('')).digest('hex').slice(0, 10);
const index = { version: Object.keys(files).length ? hash : null, updatedAt: Object.keys(files).length ? new Date().toISOString() : null, files };
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log('data/index.json version', index.version, '-', Object.keys(files).length, 'files');
