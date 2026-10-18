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
const seen = new Set(queue.items.map(i => String(i.barcode)));
let added = 0, skipped = 0;
for (const it of incoming) {
  if (!it || !it.barcode) { skipped++; continue; }
  const b = String(it.barcode);
  if (seen.has(b)) { skipped++; continue; }
  seen.add(b); queue.items.push({ ...it, status: 'pending', mergedAt: new Date().toISOString() }); added++;
}
queue.updatedAt = new Date().toISOString();
fs.writeFileSync(outFile, JSON.stringify(queue, null, 2));
console.log(`added ${added}, skipped ${skipped} (duplicate/invalid), total ${queue.items.length} -> ${outFile}`);
