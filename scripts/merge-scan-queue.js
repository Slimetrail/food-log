#!/usr/bin/env node
// Append items from an exported research-queue or weekly check-in JSON into the research bot's scan queue.
// Usage: node scripts/merge-scan-queue.js <exported.json> [/workspace/mediterranean-research/scan-queue.json]
// Accepts {"items":[...]} (Send for research) or a weekly check-in ({"researchQueue":[...]}). Dedupes by barcode.
const fs = require('fs');
const [inFile, outFile = '/workspace/mediterranean-research/scan-queue.json'] = process.argv.slice(2);
if (!inFile) { console.error('Usage: merge-scan-queue.js <exported.json> [scan-queue.json]'); process.exit(1); }
const inp = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const incoming = Array.isArray(inp.items) ? inp.items : Array.isArray(inp.researchQueue) ? inp.researchQueue : [];
let queue = { items: [] };
if (fs.existsSync(outFile)) { queue = JSON.parse(fs.readFileSync(outFile, 'utf8')); if (!Array.isArray(queue.items)) queue.items = []; }
const keyOf = i => i.barcode ? String(i.barcode) : (i.name ? 'label:' + String(i.name).trim().toLowerCase() : '');
const seen = new Map(queue.items.map(i => [keyOf(i), i]));
let added = 0, skipped = 0, updated = 0;
for (const it of incoming) {
  const b = it && keyOf(it);
  if (!b) { skipped++; continue; }
  const ex = seen.get(b);
  if (ex) {
    // keep research informed: a product that now needs a same-type swap (write a swap with fromOffCategories)
    if (it.needsSwap && !ex.needsSwap) { ex.needsSwap = true; ex.offCategories = ex.offCategories && ex.offCategories.length ? ex.offCategories : (it.offCategories || []); if (ex.nova_group == null) ex.nova_group = it.nova_group ?? null; ex.status = 'pending'; updated++; } else skipped++;
    continue;
  }
  const item = { ...it, offCategories: it.offCategories || [], needsSwap: !!it.needsSwap, status: 'pending', mergedAt: new Date().toISOString() };
  if (item.needsSwap) item.researchTask = 'Write a same-type swap entry in alternatives.json with fromOffCategories matching offCategories';
  seen.set(b, item); queue.items.push(item); added++;
}
queue.updatedAt = new Date().toISOString();
fs.writeFileSync(outFile, JSON.stringify(queue, null, 2));
console.log(`added ${added}, updated ${updated}, skipped ${skipped} (duplicate/invalid), total ${queue.items.length} -> ${outFile}`);
