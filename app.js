/* Food Log v1 — all user data stays on this device (IndexedDB). */
'use strict';
const APP_VER = '1';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const r1 = n => n == null ? null : Math.round(n * 10) / 10;
const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const startOfDay = d => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const toLocalInput = d => { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
const NUTS = ['kcal', 'protein', 'carbs', 'fiber', 'sugar', 'fat', 'satfat', 'sodium'];
const NUT_EXPORT = { kcal: 'kcal', protein: 'protein_g', carbs: 'carbs_g', fiber: 'fiber_g', sugar: 'sugar_g', fat: 'fat_g', satfat: 'satfat_g', sodium: 'sodium_mg' };
const GROUPS = { 'vegetables': 'Vegetables', 'fruits': 'Fruits', 'whole-grains': 'Whole grains', 'legumes': 'Legumes', 'nuts-seeds': 'Nuts & seeds', 'olive-oil-fats': 'Olive oil & fats', 'fish-seafood': 'Fish & seafood', 'poultry': 'Poultry', 'eggs': 'Eggs', 'dairy': 'Dairy', 'red-meat': 'Red meat', 'processed-meat': 'Processed meat', 'sweets': 'Sweets', 'beverages': 'Beverages', 'herbs-spices': 'Herbs & spices', 'other': 'Other' };
const RATING = { 'eat-freely': 'Eat freely', 'moderation': 'In moderation', 'limit': 'Limit' };
const ACT = { desk: '🪑 Desk day', moderate: '🚶 Moderate', field: '🥾 Field day' };

/* ---------- storage (IndexedDB key-value) ---------- */
const DB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('foodlog', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error); }); },
  get(k) { return new Promise(res => { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
  set(k, v) { return new Promise(res => { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); }
};
const S = { planAnchor: null, stepChecks: {}, mySteps: [], phaseLog: [], medas: [], focus: [], skips: [], tipDismissed: {}, water: {}, favorites: [], offCache: {}, pendingScans: [], goals: null, weights: [], quizHistory: [], entries: [], grocery: [], myMeals: [], plan: null, queue: [], profile: null, dailyActivity: {}, quiz: null, settings: { waterTarget: null, waterField: null, target: null, targetMin: null, planMode: 'weekly', units: 'us', intervalH: null, notify: false } };
const KEYS = Object.keys(S);
async function loadState() { for (const k of KEYS) { const v = await DB.get(k); if (v !== undefined) S[k] = (k === 'settings') ? { ...S.settings, ...v } : v; } }
const save = (...ks) => Promise.all(ks.map(k => DB.set(k, S[k])));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- research data (data/*.json, refreshed when online) ---------- */
const R = { groceryLists: null, pace: null, targets: null, medas: null, habits: null, hydration: null, quiz: null, index: null, foods: [], meals: [], groups: null, weekly: null, timing: null, swaps: [] };
async function getJSON(url) { try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function loadResearch() {
  const idx = await getJSON('data/index.json');
  R.index = idx;
  const files = (idx && idx.files) || {};
  const want = { foods: 'foods.json', meals: 'meals.json', groups: 'groups.json', weekly: 'weekly-plan.json', timing: 'meal-timing.json', swaps: 'alternatives.json', quiz: 'questionnaire.json', habits: 'habits.json', hydration: 'hydration.json', targets: 'targets.json', medas: 'medas.json', pace: 'pace.json', groceryLists: 'grocery-lists.json' };
  await Promise.all(Object.entries(want).map(async ([k, f]) => {
    if (idx && !files[f]) { R[k] = ['foods', 'meals', 'swaps'].includes(k) ? [] : null; return; }
    const j = await getJSON('data/' + f);
    if (k === 'foods') R.foods = (j && Array.isArray(j.foods)) ? j.foods : [];
    else if (k === 'meals') R.meals = (j && Array.isArray(j.meals)) ? j.meals : [];
    else if (k === 'swaps') R.swaps = (j && Array.isArray(j.swaps)) ? j.swaps : [];
    else R[k] = j;
  }));
  R.foodById = Object.fromEntries(R.foods.map(f => [f.id, f]));
  const v = idx && (idx.version + ':' + Object.entries(idx.files || {}).map(([f, x]) => f + '@' + (x.version ?? '') + '.' + (x.revision ?? '')).join(','));
  const seen = localStorage.getItem('fl_dataver');
  if (v && seen && seen !== String(v)) toast('🆕 New research update arrived' + (idx.updatedAt ? ' (' + dayKey(idx.updatedAt) + ')' : ''));
  if (v) localStorage.setItem('fl_dataver', String(v));
}
function groupsList() { const g = R.groups; if (!g) return []; if (Array.isArray(g.groups)) return g.groups; if (Array.isArray(g)) return g; return Object.entries(g).filter(([k]) => GROUPS[k]).map(([id, v]) => ({ id, ...v })); }
function groupInfo(id) { return groupsList().find(g => (g.appGroup || g.id || g.group) === id) || null; }

/* ---------- OFF category -> food / group mapping ---------- */
const CAT_GROUP = [
  [/processed-meat|sausage|ham|bacon|salami|charcuter|hot-dog|deli-meat|cured-meat/, 'processed-meat'],
  [/fish|seafood|salmon|tuna|sardine|shrimp|prawn|mackerel|anchov|shellfish|cod\b/, 'fish-seafood'],
  [/poultry|chicken|turkey/, 'poultry'], [/beef|pork|lamb|veal|red-meat|\bmeats?\b/, 'red-meat'],
  [/\beggs?\b/, 'eggs'], [/olive-oil|vegetable-oils|\boils?\b|fats|butter|margarine/, 'olive-oil-fats'],
  [/legume|bean|lentil|chickpea|hummus|pulses|peas\b/, 'legumes'], [/nuts|seeds|almond|walnut|peanut|hazelnut(?!-spread)/, 'nuts-seeds'],
  [/chocolate|candies|confection|sweet|biscuit|cookie|cake|pastr|dessert|ice-cream|sugar|spreads.*sweet|hazelnut-spread|cocoa-and-hazelnut/, 'sweets'],
  [/dairy|milk|cheese|yogurt|yoghurt|cream/, 'dairy'], [/beverage|drink|juice|soda|water|coffee|tea\b|wine|beer/, 'beverages'],
  [/fruit/, 'fruits'], [/vegetable|salad|tomato|leafy|greens/, 'vegetables'],
  [/whole-grain|wholemeal|whole-wheat|oat|cereal|bread|pasta|rice|grain/, 'whole-grains'],
  [/spice|herb|condiment|seasoning/, 'herbs-spices']
];
function mapProduct(cats, name) {
  cats = (cats || []).map(c => String(c).toLowerCase());
  let best = null, bestPos = -1;
  for (const f of R.foods) for (const oc of (f.offCategories || [])) { const p = cats.indexOf(String(oc).toLowerCase()); if (p > bestPos) { bestPos = p; best = f; } }
  if (best) return { food: best, group: best.group, how: 'Matched researched food via Open Food Facts category' };
  for (let i = cats.length - 1; i >= 0; i--) for (const [re, g] of CAT_GROUP) if (re.test(cats[i])) return { food: null, group: g, how: 'Group guessed from category "' + cats[i] + '" (please check)' };
  return { food: null, group: '', how: cats.length ? 'No group match for these categories' : '' };
}
/* science-based rule: guidance is only shown when it carries at least one source */
const hasSrc = x => !!(x && Array.isArray(x.sources) && x.sources.some(s => s && (s.url || s.title)));
const EV = { strong: 'Strong evidence', moderate: 'Moderate evidence', limited: 'Limited evidence' };
const evBadge = x => x && EV[x.evidence] ? `<span class="ev ev-${x.evidence}">${EV[x.evidence]}</span>` : '<span class="ev">Evidence not rated</span>';
function ratingFor(foodId, group) {
  const f = foodId && R.foodById && R.foodById[foodId];
  if (f && f.rating && hasSrc(f)) return f.rating;
  const g = group && groupInfo(group); return g && hasSrc(g) ? (g.rating || null) : null;
}

/* ---------- Better swaps ---------- */
const RANK = { 'eat-freely': 0, 'moderation': 1, 'limit': 2 };
function swapsFor({ cats, foodId, group, nova }) {
  cats = (cats || []).map(c => String(c).toLowerCase());
  let best = null, bestPos = -2;
  for (const sw of R.swaps) {
    if (foodId && sw.fromFoodId && sw.fromFoodId === foodId && bestPos < 1e6) { best = sw; bestPos = 1e6; continue; }
    for (const oc of (sw.fromOffCategories || [])) { const p = cats.indexOf(String(oc).toLowerCase()); if (p > bestPos && p >= 0) { bestPos = p; best = sw; } }
  }
  if (best) { const items = (best.alternatives || []).filter(hasSrc).filter(a => !(a.foodId ? foodBlocked(R.foodById[a.foodId]) : excluded(a.name))).map(a => ({ ...a, food: a.foodId && R.foodById[a.foodId] })); if (items.length) return { kind: 'research', from: best.fromDescription || '', items }; }
  const cf = foodId && R.foodById[foodId];
  if (cf && Array.isArray(cf.swapTo) && cf.swapTo.length) { const items = cf.swapTo.map(id => R.foodById[id]).filter(f => f && hasSrc(f) && !foodBlocked(f)).map(f => ({ foodId: f.id, name: f.name, why: f.notes || '', lookFor: '', sources: f.sources, evidence: f.evidence, food: f })); if (items.length) return { kind: 'research', from: cf.name, items }; }
  const rating = ratingFor(foodId, group);
  if (group && R.foods.length && (rating !== 'eat-freely' || nova == 4)) {
    const cur = rating ? RANK[rating] : 3;
    const items = R.foods.filter(f => hasSrc(f) && !foodBlocked(f) && f.group === group && f.id !== foodId && f.rating && RANK[f.rating] < (nova == 4 ? Math.max(cur, 1) : cur))
      .sort((a, b) => RANK[a.rating] - RANK[b.rating]).slice(0, 3).map(f => ({ foodId: f.id, name: f.name, why: f.notes || '', lookFor: '', sources: f.sources || [], evidence: f.evidence, food: f }));
    if (items.length) return { kind: 'group', from: GROUPS[group] || group, items };
  }
  return null;
}
function srcLinks(srcs) { const l = (srcs || []).filter(x => x && (x.url || x.title)); if (!l.length) return ''; return `<details class="cite"><summary>📚 ${l.length} source${l.length === 1 ? '' : 's'}</summary>${l.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a>${x.year ? ' (' + esc(x.year) + ')' : ''}` : esc(x.title)).join('<br>')}</details>`; }
const SWAPSETS = []; let lastStoreItem = null;
function swapsHTML(ctx) {
  const sw = swapsFor(ctx);
  if (!sw) return R.swaps.length || R.foods.length ? '' : `<div class="swaps placeholder"><b>🔁 Better swaps</b>Same-type alternatives will appear here once research data arrives.</div>`;
  const sid = SWAPSETS.push(sw.items) - 1, storeId = ctx.storeItemId || '';
  return `<div class="swaps" data-sid="${sid}"><b>🔁 Better swaps</b>${sw.kind === 'group' ? `<div class="sub">Better-rated ${esc(sw.from)} from your research list</div>` : (sw.from ? `<div class="sub">Instead of ${esc(sw.from)}</div>` : '')}
  <div class="swap-ask">Want to swap? Add one to your grocery list.</div>
  <ul>${sw.items.map((a, i) => `<li><b>${esc(a.name || (a.food && a.food.name) || '')}</b>${a.food && a.food.rating ? ` <span class="tag rate-${a.food.rating}">${RATING[a.food.rating]}</span>` : ''}${a.why ? `<div>${esc(a.why)}</div>` : ''}${a.lookFor ? `<div class="look">🔎 Look for: ${esc(a.lookFor)}</div>` : ''}<div class="src">${evBadge(a)} ${srcLinks(a.sources)}</div>
  <button type="button" class="btn swap-add" data-i="${i}">➕ Add to grocery list</button>${storeId ? `<button type="button" class="btn primary swap-it" data-i="${i}" data-item="${esc(storeId)}">🔁 Swap it: take this off my list, add the alternative</button>` : ''}</li>`).join('')}</ul></div>`;
}
const swapBlocked = x => (x.allergens || []).map(normAllergen).some(a => userAllergens().includes(a)) || (x.foodId ? foodBlocked(R.foodById[x.foodId]) : excluded(x.name));
function swapGroceryItems(a) {
  const meal = a.mealId && typeof mealById === 'function' ? mealById(a.mealId) : null;
  const ings = Array.isArray(a.ingredients) && a.ingredients.length ? a.ingredients : (meal && Array.isArray(meal.ingredients) && meal.ingredients.length ? meal.ingredients : null);
  if (!ings) return [{ name: a.name || (a.food && a.food.name), text: a.name || (a.food && a.food.name), backups: [] }];
  const out = [];
  for (const it of ings) {
    let pick = it; const backs = (it.backups || []).filter(b => !swapBlocked(b));
    if (swapBlocked(it)) { pick = backs.shift(); if (!pick) continue; }
    out.push({ name: pick.name, text: pick.name + (pick.amount ? ' — ' + pick.amount : ''), backups: backs.filter(b => b !== pick).map(b => b.name) });
  }
  return out;
}
async function addSwapToGrocery(a, removeId) {
  let removed = '';
  if (removeId) { const g = S.grocery.find(x => x.id === removeId); if (g) { removed = g.text; S.grocery = S.grocery.filter(x => x !== g); } }
  let added = 0, dup = 0;
  for (const it of swapGroceryItems(a)) {
    if (!it.name) continue;
    if (S.grocery.some(g => !g.done && (g.name || g.text).toLowerCase() === it.name.toLowerCase())) { dup++; continue; }
    S.grocery.push({ id: uid(), text: it.text, name: it.name, backups: it.backups, done: false, from: 'swap' }); added++;
  }
  await save('grocery'); renderGrocery();
  toast((removed ? `Removed "${removed}". ` : '') + (added ? `Added ${added} item${added === 1 ? '' : 's'} to your grocery list` : 'Already on your grocery list') + (added && dup ? ` (${dup} already there)` : ''));
}
document.addEventListener('click', e => {
  const b = e.target.closest('.swap-add, .swap-it'); if (!b) return; e.preventDefault();
  const items = SWAPSETS[+b.closest('.swaps').dataset.sid]; const a = items && items[+b.dataset.i]; if (!a) return;
  addSwapToGrocery(a, b.classList.contains('swap-it') ? b.dataset.item : null).then(() => { if (b.classList.contains('swap-it')) b.closest('.swaps').querySelectorAll('.swap-it').forEach(x => x.remove()); });
});

/* ---------- navigation ---------- */
const TITLES = { today: 'Food Log', add: 'Add food', progress: 'Progress', guide: 'Mediterranean guide', plan: 'Meal plan & prep', grocery: 'Grocery list', profile: 'Your profile', quiz: 'Questionnaire' };
let curTab = 'today';
function show(tab) {
  curTab = tab;
  $$('.screen').forEach(s => s.hidden = s.id !== 's-' + tab);
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('.tabs').hidden = tab === 'profile' && !S.profile;
  $('#title').textContent = TITLES[tab] || '';
  if (tab !== 'add') scanner.stop();
  if (tab !== 'grocery') { storeScanner.stop(); }
  ({ today: renderToday, progress: renderProgress, guide: renderGuide, plan: renderPlan, grocery: renderGrocery })[tab]?.();
  window.scrollTo(0, 0);
}
$$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.tab));

/* ---------- profile (local only) ---------- */
const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
function ageFrom(p) { if (p.birthDate) { const b = new Date(p.birthDate), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; } return p.ageYears ?? null; }
function setUnits(u) { S.settings.units = u; $$('#pfUnits .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.u === u)); $$('.us-only').forEach(e => e.hidden = u !== 'us'); $$('.metric-only').forEach(e => e.hidden = u === 'us'); }
$$('#pfUnits .seg-btn').forEach(b => b.onclick = () => setUnits(b.dataset.u));
$('#pfAllergens').onclick = e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); };
function fillProfile() {
  const p = S.profile || {};
  $('#pfSex').value = p.sex || ''; $('#pfBirth').value = p.birthDate || ''; $('#pfAge').value = p.birthDate ? '' : (p.ageYears ?? '');
  setUnits(S.settings.units || 'us');
  if (p.heightCm) { $('#pfCm').value = r1(p.heightCm); const ti = p.heightCm / 2.54; $('#pfFt').value = Math.floor(ti / 12); $('#pfIn').value = r1(ti % 12); } else { ['#pfCm', '#pfFt', '#pfIn'].forEach(s => $(s).value = ''); }
  if (p.weightKg) { $('#pfKg').value = r1(p.weightKg); $('#pfLb').value = r1(p.weightKg / 0.45359237); } else { $('#pfKg').value = ''; $('#pfLb').value = ''; }
  $('#pfAct').value = p.activityLevel || '';
  $$('.goals input').forEach(c => c.checked = p.goals ? p.goals.includes(c.value) : c.value === 'eat-more-mediterranean');
  $('#pfGoalsText').value = p.goalsText || ''; $$('#pfAllergens button').forEach(b => b.classList.toggle('on', (p.allergies || []).includes(b.dataset.al))); $('#pfAvoid').value = (p.avoidFoods || []).join(', ');
  $('#pfTarget').value = p.calorieTarget ?? S.settings.targetMin ?? '';
  $('#pfCancel').hidden = !S.profile; $('#pfErr').textContent = '';
}
$('#profileForm').onsubmit = async e => {
  e.preventDefault();
  const us = S.settings.units === 'us';
  const heightCm = us ? ((num($('#pfFt').value) || 0) * 12 + (num($('#pfIn').value) || 0)) * 2.54 || null : num($('#pfCm').value);
  const weightKg = us ? (num($('#pfLb').value) != null ? num($('#pfLb').value) * 0.45359237 : null) : num($('#pfKg').value);
  const birthDate = $('#pfBirth').value || null, ageIn = num($('#pfAge').value);
  const errs = [];
  if (!$('#pfSex').value) errs.push('sex');
  if (!birthDate && !(ageIn > 0 && ageIn < 120)) errs.push('age or birth date');
  if (!(heightCm > 50 && heightCm < 260)) errs.push('height');
  if (!(weightKg > 20 && weightKg < 350)) errs.push('weight');
  if (errs.length) { $('#pfErr').textContent = 'Please fill in: ' + errs.join(', '); return; }
  const p = { sex: $('#pfSex').value, birthDate, ageYears: null, heightCm: r1(heightCm), weightKg: r1(weightKg), activityLevel: $('#pfAct').value || null,
    goals: $$('.goals input:checked').map(c => c.value), goalsText: $('#pfGoalsText').value.trim(), allergies: $$('#pfAllergens button.on').map(b => b.dataset.al), avoidFoods: csv($('#pfAvoid').value),
    calorieTarget: num($('#pfTarget').value), updatedAt: new Date().toISOString() };
  p.ageYears = birthDate ? ageFrom(p) : Math.round(ageIn);
  const first = !S.profile; S.profile = p; if (p.calorieTarget) S.settings.targetMin = p.calorieTarget; await save('profile', 'settings');
  toast('Profile saved on this phone'); if (first && R.quiz && !S.quiz) { renderQuiz(); show('quiz'); } else show('today');
};
$('#pfCancel').onclick = () => show('today');
$('#editProfileBtn').onclick = () => { $('#settings').close(); fillProfile(); show('profile'); };
function exportProfile() { const p = S.profile; if (!p) return null; return { sex: p.sex, birthDate: p.birthDate, ageYears: ageFrom(p), heightCm: p.heightCm, weightKg: p.weightKg, activityLevel: p.activityLevel, goals: p.goals || [], goalsText: p.goalsText || '', allergies: p.allergies || [], avoidFoods: p.avoidFoods || [], calorieTarget: p.calorieTarget ?? null, updatedAt: p.updatedAt }; }

/* ---------- entries / today ---------- */
let viewDay = startOfDay(new Date());
const entryKcal = e => { const k = e.per && e.per.kcal; if (k == null) return null; return e.basis === '100g' ? k * (e.qty || 0) / 100 : k * (e.qty || 0); };
const entryNut = (e, n) => { const v = e.per && e.per[n]; if (v == null) return null; return e.basis === '100g' ? v * (e.qty || 0) / 100 : v * (e.qty || 0); };
const entriesOn = d => { const k = dayKey(d); return S.entries.filter(e => dayKey(e.ts) === k).sort((a, b) => a.ts - b.ts); };
function lastMeal() { const now = Date.now(); let l = null; for (const e of S.entries) if (e.ts <= now && (!l || e.ts > l.ts)) l = e; return l; }
const hms = ms => { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
function timingRule() {
  const rules = ((R.timing && R.timing.rules) || []).filter(hasSrc);
  const a = S.dailyActivity[dayKey(new Date())] || (S.profile && S.profile.activityLevel === 'varies' ? null : 'desk');
  const want = a === 'field' ? 'field' : 'desk';
  return rules.find(r => r.activity === want) || rules.find(r => r.activity === 'any') || null;
}
let notifiedFor = null;
function tick() {
  const l = lastMeal();
  if (!l) { $('#timer').textContent = '—'; $('#lastMeal').textContent = 'Nothing logged yet'; $('#nextMeal').innerHTML = ''; return; }
  const since = Date.now() - l.ts;
  $('#timer').textContent = hms(since);
  $('#lastMeal').textContent = 'Last: ' + l.name + ' · ' + (dayKey(l.ts) === dayKey(new Date()) ? '' : fmtDay(l.ts) + ' ') + fmtTime(l.ts);
  const rule = timingRule();
  let minH = null, maxH = null, src = '', planHtml = '', srcHtml = rule ? `<div class="src light">${evBadge(rule)} ${srcLinks(rule.sources)}</div>` : '';
  if (rule && rule.mealsPerDay) { const occ = occasions(entriesOn(new Date())), plan = rule.mealsPerDay + (rule.snacksPerDay || 0);
    planHtml = `Today's plan: <b>${rule.mealsPerDay} meals${rule.snacksPerDay ? ' + ' + rule.snacksPerDay + ' snack' : ''}</b> · ${Math.min(occ, plan)} of ${plan} so far`; }
  const cd = rule && rule.countdown, fu = rule && rule.fueling;
  if (cd && cd.dueAfterHours != null) { minH = cd.dueAfterHours; maxH = cd.latestHours; src = 'research'; }
  else if (rule && rule.minHoursBetween != null) { minH = rule.minHoursBetween; maxH = rule.maxHoursBetween; src = 'research'; }
  if (fu && rule.activity === 'field') { const ph = rule.preHikeMealHoursBefore || fu.preHikeMealHoursBefore, rh = (R.targets && R.targets.recovery && R.targets.recovery.withinHours) || rule.recoveryWithinHours;
    planHtml = `🥾 Field day: eat a meal ${ph ? ph.min + '–' + ph.max + ' h before you head out' : 'before heading out'}; on hikes over ${fu.appliesWhenActivityLongerThanHours} h, fuel every ${fu.intervalHours} h${rh ? `; recovery meal within ${rh} h after` : ''}.`; }
  if (minH == null && S.settings.intervalH) { minH = S.settings.intervalH; src = 'your reminder interval (research has no value for today)'; }
  if (minH == null) { $('#nextMeal').innerHTML = (planHtml || 'Meal timing: <i>coming from research</i>') + '<div class="sub">Set a reminder interval in ⚙️ for a countdown</div>' + srcHtml; return; }
  const due = l.ts + minH * 3600000, left = due - Date.now();
  let html = left > 0 ? `${fu && rule.activity === 'field' && src === 'research' ? 'Next snack on the trail in' : 'Next meal or snack in'} <b>${hms(left)}</b>` : `<b>Time to refuel 🍎</b> — even a small snack counts`;
  html += fu && rule.activity === 'field' && src === 'research' ? `<div class="sub">Hike fuel every ${minH} h (hikes over ${fu.appliesWhenActivityLongerThanHours} h)</div>` : maxH ? `<div class="sub">Usually ${minH}–${maxH} h after your last meal · ${esc(src)}</div>` : `<div class="sub">Every ${minH} h · ${esc(src)}</div>`;
  $('#nextMeal').innerHTML = (planHtml ? planHtml + '<div style="height:6px"></div>' : '') + html + srcHtml;
  if (left <= 0 && S.settings.notify && notifiedFor !== l.id && 'Notification' in window && Notification.permission === 'granted') {
    notifiedFor = l.id;
    navigator.serviceWorker?.ready.then(r => r.showNotification('Food Log', { body: 'Time to refuel 🍎 A small snack or meal would be great right now.', icon: 'icons/icon-192.png', tag: 'meal-due' })).catch(() => new Notification('Food Log', { body: 'Time to refuel 🍎 A small snack or meal would be great right now.' }));
  }
}
setInterval(() => { if (curTab === 'today') tick(); }, 1000);
function renderActivity() { const a = S.dailyActivity[dayKey(viewDay)] || ''; $$('#actSeg .chip').forEach(b => b.classList.toggle('active', b.dataset.a === a)); }
$$('#actSeg .chip').forEach(b => b.onclick = async () => { const k = dayKey(viewDay); if (S.dailyActivity[k] === b.dataset.a) delete S.dailyActivity[k]; else S.dailyActivity[k] = b.dataset.a; await save('dailyActivity'); renderToday(); });
function novaShare() {
  const from = startOfDay(addDays(new Date(), -6)).getTime();
  const es = S.entries.filter(e => e.ts >= from && e.ts <= Date.now());
  const k = { 1: 0, 2: 0, 3: 0, 4: 0 }; let unknown = 0, known = 0;
  for (const e of es) { const kc = entryKcal(e); if (e.nova >= 1 && e.nova <= 4 && kc != null) { k[e.nova] += kc; known++; } else unknown++; }
  return { k, unknown, known, total: k[1] + k[2] + k[3] + k[4] };
}
function renderNova() {
  const n = novaShare();
  if (!n.known) { $('#novaCard').innerHTML = `<b>Whole vs processed · last 7 days</b><div class="sub">Scan packaged foods or set "Processing (NOVA)" on entries to see your share here.${n.unknown ? ' ' + n.unknown + ' entr' + (n.unknown === 1 ? 'y has' : 'ies have') + ' no NOVA info.' : ''}</div>`; return; }
  const pct = x => Math.round(100 * x / n.total);
  const whole = pct(n.k[1] + n.k[2]), upf = pct(n.k[4]);
  $('#novaCard').innerHTML = `<div class="row between" style="margin:0"><b>Whole vs processed · last 7 days</b><b style="color:${upf >= 50 ? 'var(--bad)' : 'var(--g)'}">${whole}% whole</b></div>
  <div class="stack">${[1, 2, 3, 4].map(i => `<div class="n${i}" style="width:${100 * n.k[i] / n.total}%"></div>`).join('')}</div>
  <div class="legend"><span><i class="n1"></i>Whole/minimal ${pct(n.k[1])}%</span><span><i class="n2"></i>Ingredients ${pct(n.k[2])}%</span><span><i class="n3"></i>Processed ${pct(n.k[3])}%</span><span><i class="n4"></i>Ultra-processed ${upf}%</span></div>
  <div class="sub">Share of calories from ${n.known} entr${n.known === 1 ? 'y' : 'ies'} with NOVA data${n.unknown ? ' · ' + n.unknown + ' without' : ''}.</div>`;
}
function renderToday() {
  const isToday = dayKey(viewDay) === dayKey(new Date());
  $('#dayLabel').textContent = isToday ? 'Today' : fmtDay(viewDay);
  $('#nextDay').disabled = isToday;
  const es = entriesOn(viewDay);
  const total = es.reduce((a, e) => a + (entryKcal(e) || 0), 0);
  $('#kcalTotal').textContent = Math.round(total).toLocaleString();
  const mn = S.settings.targetMin, mx = S.settings.target, tl = $('#targetLine');
  tl.className = 'target';
  if (mn && total < mn) tl.innerHTML = `${Math.round(total / mn * 100)}% of your ${mn.toLocaleString()} kcal minimum · ${Math.round(mn - total).toLocaleString()} to go${isToday ? ' — you’ve got this 💪' : ''}`;
  else if (mn) { tl.classList.add('good'); tl.textContent = '✅ Minimum reached — nicely fueled!' + (mx ? (total > mx ? ' (' + Math.round(total - mx) + ' above your ' + mx.toLocaleString() + ' max)' : ' Max: ' + mx.toLocaleString()) : ''); }
  else if (mx) tl.textContent = total <= mx ? Math.round(mx - total).toLocaleString() + ' kcal room under your ' + mx.toLocaleString() + ' max' : Math.round(total - mx).toLocaleString() + ' kcal above your ' + mx.toLocaleString() + ' max';
  else tl.textContent = 'Set a daily minimum (and optional max) in ⚙️';
  const goal = mn || mx, bar = $('#targetBar');
  bar.style.width = goal ? Math.min(100, 100 * total / goal) + '%' : '0'; bar.classList.toggle('over', !mn && !!mx && total > mx); $('.counter-card .bar').hidden = !goal;
  renderTodayGoals(es, total); renderHomeAlerts(); renderNutri(es); renderHomeTips(es);
  $('#entries').innerHTML = es.map(e => {
    const kc = entryKcal(e), r = ratingFor(e.foodId, e.group);
    const amt = e.basis === '100g' ? (e.qty + ' g') : (e.qty + ' serving' + (e.qty == 1 ? '' : 's') + (e.servingSize ? ' (' + e.servingSize + ')' : ''));
    return `<li class="entry-wrap" data-id="${e.id}"><div class="entry">${e.thumb ? `<img src="${e.thumb}" alt="">` : `<div class="ph">${e.source === 'off' ? '📦' : e.source === 'label' ? '🏷️' : '🍽️'}</div>`}
      <div class="info"><div class="nm">${esc(e.name)}${e.nova == 4 ? '<span class="upf">UPF</span>' : ''}</div>${e.pendingLookup ? '<div class="sub">⏳ Will look up when online</div>' : e.needsReview ? '<div class="sub">✏️ Please check the amount</div>' : ''}<div class="sub">${fmtTime(e.ts)} · ${esc(amt)}${e.group ? ' · ' + esc(GROUPS[e.group] || e.group) : ''}${r ? ` <span class="tag rate-${r}">${RATING[r]}</span>` : ''}</div></div>
      <div class="kc">${kc == null ? '? kcal' : Math.round(kc) + ' kcal'}</div>
      <div class="actions"><button class="icon-btn" data-act="swap" aria-label="Better swaps">🔁</button><button class="icon-btn" data-act="edit" aria-label="Edit">✏️</button><button class="icon-btn" data-act="del" aria-label="Delete">🗑️</button></div></div><div class="sw-slot"></div></li>`;
  }).join('');
  const sk = S.skips.filter(k => dayKey(k.ts) === dayKey(viewDay));
  $('#entries').insertAdjacentHTML('beforeend', sk.map(k => `<li class="entry-wrap" data-skip="${k.id}"><div class="entry skip"><div class="ph">⏭️</div><div class="info"><div class="nm">Skipped ${esc(k.slot)}</div><div class="sub">${fmtTime(k.ts)}${k.reason ? ' · ' + esc(SKIP_R[k.reason] || k.reason) : ''}</div></div><div class="actions"><button class="icon-btn" data-act="unskip" aria-label="Remove">🗑️</button></div></div></li>`).join(''));
  $('#entriesEmpty').hidden = es.length + sk.length > 0;
  renderWater(); renderFieldSnacks();
  renderActivity(); tick();
}
$('#entries').onclick = async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const li = b.closest('li');
  if (b.dataset.act === 'unskip') { S.skips = S.skips.filter(k => k.id !== li.dataset.skip); await save('skips'); return renderToday(); }
  const e = S.entries.find(x => x.id === li.dataset.id); if (!e) return;
  if (b.dataset.act === 'del') { if (!confirm('Delete "' + e.name + '"?')) return; S.entries = S.entries.filter(x => x !== e); await save('entries'); renderToday(); }
  else if (b.dataset.act === 'edit') { show('add'); openFoodForm(e, { editId: e.id }); }
  else if (b.dataset.act === 'swap') { const slot = li.querySelector('.sw-slot'); slot.innerHTML = slot.innerHTML ? '' : (swapsHTML({ cats: e.categories, foodId: e.foodId, group: e.group, nova: e.nova }) || '<div class="swaps"><b>🔁 Better swaps</b><div class="sub">No better-rated alternative in your research data for this one.</div></div>'); }
};
$('#prevDay').onclick = () => { viewDay = addDays(viewDay, -1); renderToday(); };
$('#nextDay').onclick = () => { viewDay = addDays(viewDay, 1); renderToday(); };

/* ---------- barcode scanner (BarcodeDetector, ZXing fallback) ---------- */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
class Scanner {
  constructor(video, msgEl, onCode) { this.video = video; this.msg = msgEl; this.onCode = onCode; this.stream = null; this.zx = null; this.on = false; }
  async start() {
    if (this.on) return; this.on = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.msg.textContent = 'Camera not available here (needs HTTPS). Use photo or type the number.'; this.on = false; return false; }
    this.msg.textContent = 'Starting camera…';
    try {
      if ('BarcodeDetector' in window) {
        const sup = await BarcodeDetector.getSupportedFormats().catch(() => []);
        const fmts = FORMATS.filter(f => sup.includes(f));
        if (fmts.length) {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
          this.video.srcObject = this.stream; await this.video.play();
          const det = new BarcodeDetector({ formats: fmts });
          this.msg.textContent = 'Point at a barcode';
          const loop = async () => {
            if (!this.on) return;
            try { const r = await det.detect(this.video); if (r.length) { this.hit(r[0].rawValue); return; } } catch {}
            setTimeout(loop, 180);
          };
          loop(); return true;
        }
      }
      if (!window.ZXing) throw new Error('No barcode engine available');
      const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128]);
      this.zx = new ZXing.BrowserMultiFormatReader(hints);
      this.msg.textContent = 'Point at a barcode';
      await this.zx.decodeFromConstraints({ video: { facingMode: 'environment' } }, this.video, (res) => { if (res && this.on) this.hit(res.getText()); });
      return true;
    } catch (err) { this.msg.textContent = 'Camera error: ' + (err && err.name === 'NotAllowedError' ? 'permission denied' : (err.message || err)); this.stop(true); return false; }
  }
  hit(code) { if (navigator.vibrate) navigator.vibrate(60); this.stop(); this.onCode(code); }
  stop(keepMsg) { this.on = false; if (this.zx) { try { this.zx.reset(); } catch {} this.zx = null; } if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; } this.video.srcObject = null; if (!keepMsg) this.msg.textContent = 'Camera is off'; }
}
async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if ('BarcodeDetector' in window) { try { const r = await new BarcodeDetector({ formats: FORMATS }).detect(img); if (r.length) return r[0].rawValue; } catch {} }
    if (window.ZXing) { try { const res = await new ZXing.BrowserMultiFormatReader().decodeFromImageElement(img); return res.getText(); } catch {} }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Open Food Facts lookup (real data only) ---------- */
const OFF_FIELDS = 'allergens_tags,traces_tags,code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments,categories_tags,ingredients_text,ingredients_text_en,nova_group,image_front_small_url,quantity';
async function offLookup(code) {
  code = String(code).replace(/\D/g, '');
  try { const p = await offFetch(code); if (p.found) { S.offCache[code] = { ...p, cachedAt: Date.now() }; const ks = Object.keys(S.offCache); if (ks.length > 300) ks.sort((a, b) => S.offCache[a].cachedAt - S.offCache[b].cachedAt).slice(0, ks.length - 300).forEach(k => delete S.offCache[k]); save('offCache'); } return p; }
  catch (err) { if (S.offCache[code]) return { ...S.offCache[code], fromCache: true }; err.offline = !navigator.onLine || err instanceof TypeError; throw err; }
}
async function offFetch(code) {
  if (!code) throw new Error('No barcode number');
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
  if (r.status === 404) return { found: false, code };
  if (!r.ok) throw new Error('Open Food Facts error ' + r.status);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return { found: false, code };
  const p = j.product, n = p.nutriments || {};
  const pick = suf => {
    let kcal = num(n['energy-kcal' + suf]), kcalNote = '';
    if (kcal == null && num(n['energy-kj' + suf]) != null) { kcal = r1(num(n['energy-kj' + suf]) / 4.184); kcalNote = 'kcal converted from kJ'; }
    const sod = num(n['sodium' + suf]);
    const o = { kcal, protein: num(n['proteins' + suf]), carbs: num(n['carbohydrates' + suf]), fiber: num(n['fiber' + suf]), sugar: num(n['sugars' + suf]), fat: num(n['fat' + suf]), satfat: num(n['saturated-fat' + suf]), sodium: sod == null ? null : r1(sod * 1000) };
    return { vals: o, any: Object.values(o).some(v => v != null), kcalNote };
  };
  const per100 = pick('_100g'), perServ = pick('_serving');
  return { found: true, code, name: p.product_name || p.product_name_en || p.generic_name || '', brand: (p.brands || '').split(',')[0].trim(), servingSize: p.serving_size || '', servingQty: num(p.serving_quantity),
    per100: per100.any ? per100.vals : null, perServing: perServ.any ? perServ.vals : null, kcalNote: per100.kcalNote || perServ.kcalNote,
    categories: p.categories_tags || [], ingredientsText: p.ingredients_text || p.ingredients_text_en || '', allergens: p.allergens_tags || [], traces: p.traces_tags || [], nova: num(p.nova_group), image: p.image_front_small_url || '', quantity: p.quantity || '' };
}

/* ---------- research queue (unmatched scans) ---------- */
async function queueProduct(p) {
  if (!p || !p.found || !p.code) return;
  if (mapProduct(p.categories, p.name).food) return;
  if (S.queue.some(q => q.barcode === p.code)) return;
  const n = p.per100 || {};
  S.queue.push({ barcode: p.code, name: p.name, brand: p.brand, offCategories: p.categories, nova_group: p.nova ?? null,
    nutritionPer100g: Object.fromEntries(NUTS.map(k => [NUT_EXPORT[k], n[k] ?? null])), ingredientsText: p.ingredientsText || '', scannedAt: new Date().toISOString(), status: 'pending' });
  await save('queue');
}

/* ---------- add screen ---------- */
let addMode = 'barcode';
$$('.seg-btn[data-mode]').forEach(b => b.onclick = () => { addMode = b.dataset.mode; $$('.seg-btn[data-mode]').forEach(x => x.classList.toggle('active', x === b)); ['barcode', 'label', 'out', 'manual'].forEach(m => $('#m-' + m).hidden = m !== addMode); if (addMode !== 'barcode') scanner.stop(); });
const setStatus = (el, msg, cls = '') => { el.textContent = msg; el.className = 'status ' + cls; };
const scanner = new Scanner($('#video'), $('#videoMsg'), code => { $('#barcodeInput').value = code; lookupAndOpen(code); });
$('#scanBtn').onclick = () => scanner.on ? scanner.stop() : scanner.start();
$('#barcodeForm').onsubmit = e => { e.preventDefault(); lookupAndOpen($('#barcodeInput').value); };
$('#barcodeFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; setStatus($('#scanStatus'), 'Reading barcode from photo…'); const c = await decodeImageFile(f); if (!c) return setStatus($('#scanStatus'), 'No barcode found in that photo. Try a closer, sharper shot or type the number.', 'err'); $('#barcodeInput').value = c; lookupAndOpen(c); };
async function lookupAndOpen(code) {
  const st = $('#scanStatus');
  setStatus(st, 'Looking up ' + code + ' on Open Food Facts…');
  try {
    const p = await offLookup(code);
    if (!p.found) { setStatus(st, 'Barcode ' + code + ' is not in Open Food Facts. Enter the values from the package below.', 'err'); openFoodForm({ name: '', barcode: String(code), source: 'manual' }, { note: 'Not found in Open Food Facts — manual entry' }); return; }
    if (!p.per100 && !p.perServing) setStatus(st, 'Found "' + p.name + '" but Open Food Facts has no nutrition values for it. Please enter them from the package.', 'err');
    else setStatus(st, 'Found: ' + (p.name || code) + (p.fromCache ? ' (saved copy, offline)' : ''), 'ok');
    lastProduct = p;
    openFoodForm(offToEntry(p), { product: p });
  } catch (err) {
    if (err.offline) { setStatus(st, "You're offline. Barcode " + code + " is saved and will be looked up automatically when you're back online. Set how much you ate now.", 'err'); openFoodForm({ name: 'Barcode ' + code + ' (lookup pending)', barcode: String(code), source: 'pending', basis: 'serving', qty: 1 }, { note: 'Offline: nutrition fills in when back online. You can also type values yourself.' }); }
    else { setStatus(st, 'Lookup failed: ' + err.message + '. You can enter the values manually.', 'err'); openFoodForm({ name: '', barcode: String(code), source: 'manual' }, {}); }
  }
}
let lastProduct = null;
function offToEntry(p) {
  const basis = p.perServing && p.perServing.kcal != null ? 'serving' : (p.per100 ? '100g' : 'serving');
  const m = mapProduct(p.categories, p.name);
  return { name: p.name, brand: p.brand, barcode: p.code, source: 'off', basis, servingSize: p.servingSize, per: { ...(basis === 'serving' ? p.perServing : p.per100) || {} }, qty: basis === '100g' ? '' : 1,
    categories: p.categories, allergens: p.allergens || [], foodId: m.food ? m.food.id : null, group: m.group, nova: p.nova, offImage: p.image, ingredientsText: p.ingredientsText };
}

/* ---------- food confirm/edit form ---------- */
let ff = null; // { entry, product, editId, thumb }
function groupOptions(sel) { return '<option value="">— Unassigned —</option>' + Object.entries(GROUPS).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join(''); }
function openFoodForm(entry, opts = {}) {
  ff = { entry, product: opts.product || null, editId: opts.editId || null, thumb: entry.thumb || null };
  const f = $('#foodForm'); f.hidden = false;
  const srcName = { estimate: 'Eating out · user estimate', off: 'Open Food Facts', label: 'Label photo (check numbers!)', manual: 'Manual entry', pending: 'Saved offline · lookup pending' }[entry.source] || 'Manual entry';
  $('#ffSource').textContent = opts.editId ? 'Editing · ' + srcName : srcName;
  const p = ff.product;
  $('#ffMeta').textContent = opts.note || (p ? [entry.barcode, p.quantity, p.kcalNote].filter(Boolean).join(' · ') : (entry.barcode || ''));
  const th = $('#ffThumb'); th.hidden = !(entry.thumb || entry.offImage); th.src = entry.thumb || entry.offImage || '';
  $('#ffName').value = entry.name || ''; $('#ffBrand').value = entry.brand || '';
  $('#ffBasis').value = entry.basis || 'serving'; $('#ffServing').value = entry.servingSize || '';
  NUTS.forEach(n => $('#ff_' + n).value = entry.per && entry.per[n] != null ? entry.per[n] : '');
  $('#ffQty').value = entry.qty ?? 1; $('#ffWhen').value = toLocalInput(entry.ts || Date.now());
  $('#ffGroup').innerHTML = groupOptions(entry.group || ''); $('#ffNova').value = entry.nova || '';
  const m = entry.foodId && R.foodById[entry.foodId];
  $('#ffMatch').innerHTML = m ? `🫒 Research match: <b>${esc(m.name)}</b>${m.rating && hasSrc(m) ? ` <span class="tag rate-${m.rating}">${RATING[m.rating]}</span> ${evBadge(m)}<div class="src">${srcLinks(m.sources)}</div>` : ''}` : (entry.categories && entry.categories.length ? esc(mapProduct(entry.categories, entry.name).how) + (R.foods.length ? ' · will be added to your research queue' : '') : '');
  const hits = productAllergyHits(entry.allergens); if (hits.length) $('#ffMatch').insertAdjacentHTML('afterbegin', `<div class="upf-flag">🚫 Contains ${hits.map(a => esc(ALLERGENS[a] || a)).join(', ')} (your allergy list), per Open Food Facts. Always check the package.</div>`);
  $('#ffKeepThumb').parentElement.hidden = !entry.thumb && !ff.thumb;
  $('#ffSave').textContent = opts.editId ? 'Save changes' : 'Save to log';
  $('#ffSocial').checked = !!entry.social;
  $('#ffFav').checked = S.favorites.some(f => favKey(f) === favKey(entry));
  let sw = f.querySelector('.swaps'); if (sw) sw.remove();
  f.querySelector('.total-line').insertAdjacentHTML('beforebegin', swapsHTML({ cats: entry.categories, foodId: entry.foodId, group: entry.group, nova: entry.nova }));
  const missing = !entry.per || entry.per.kcal == null;
  $('#nutBox').open = missing || entry.source === 'label' || entry.source === 'manual';
  updateFF(); f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function researchPortion() {
  const fd = ff && ff.entry.foodId && R.foodById[ff.entry.foodId];
  if (!fd || !fd.portion || !hasSrc(fd)) return null;
  return { food: fd, ...fd.portion };
}
function renderMeasures() {
  const basis = $('#ffBasis').value, p = ff && ff.product, chips = [];
  const rp = researchPortion();
  if (basis === 'serving') { [0.5, 1, 1.5, 2].forEach(v => chips.push([v, v + (v === 1 ? ' serving' : ' servings')])); }
  else {
    if (p && p.servingQty) { chips.push([p.servingQty, '1 serving (' + (p.servingSize || p.servingQty + ' g') + ')']); chips.push([p.servingQty * 2, '2 servings']); }
    if (rp && /^(g|ml)$/i.test(rp.unit || '') && rp.amount != null) chips.push([rp.amount, 'Suggested: ' + (rp.household ? rp.household + ' · ' : '') + rp.amount + ' ' + rp.unit]);
    [50, 100, 150].forEach(v => chips.push([v, v + ' g']));
  }
  $('#measureChips').innerHTML = chips.map(([v, l]) => `<button type="button" data-v="${v}">${esc(l)}</button>`).join('');
  const ss = $('#ffServing').value.trim();
  $('#suggestPortion').innerHTML = (basis === 'serving' && ss ? `1 serving = <b>${esc(ss)}</b>` : '') +
    (rp ? `<div>🫒 Suggested portion: <b>${esc([rp.household, [rp.amount, rp.unit].filter(x => x != null).join(' ')].filter(Boolean).join(' · '))}</b> ${evBadge(rp.food)}<div class="src">${srcLinks(rp.food.sources)}</div></div>` : '');
}
$('#measureChips').onclick = e => { const b = e.target.closest('button[data-v]'); if (!b) return; $('#ffQty').value = r1(+b.dataset.v); updateFF(); };
const stepQty = d => { const basis = $('#ffBasis').value, st = basis === '100g' ? 10 : 0.5; const v = Math.max(0, (num($('#ffQty').value) || 0) + d * st); $('#ffQty').value = r1(v); updateFF(); };
$('#qtyMinus').onclick = () => stepQty(-1); $('#qtyPlus').onclick = () => stepQty(1);
function readPer() { return Object.fromEntries(NUTS.map(n => [n, num($('#ff_' + n).value)])); }
function updateFF() {
  const basis = $('#ffBasis').value;
  $('#qtyLabel').textContent = basis === '100g' ? 'How much did you eat? (grams or ml)' : 'How many servings?';
  $('#nutBasisLabel').textContent = basis === '100g' ? '(per 100 g)' : '(per serving)';
  if (!updateFF.busy) { updateFF.busy = true; renderMeasures(); updateFF.busy = false; }
  const k = num($('#ff_kcal').value), q = num($('#ffQty').value);
  $('#ffTotal').textContent = k == null || q == null ? '? kcal (add calories below)' : Math.round(basis === '100g' ? k * q / 100 : k * q) + ' kcal';
  $('#ffUpf').hidden = $('#ffNova').value !== '4';
}
$('#foodForm').oninput = e => { if (e.target.id !== 'ffQty') renderMeasures(); updateFF(); };
$('#ffBasis').onchange = () => {
  const p = ff && ff.product; const b = $('#ffBasis').value;
  if (p) { const src = b === '100g' ? p.per100 : p.perServing; if (src) NUTS.forEach(n => $('#ff_' + n).value = src[n] ?? ''); else { NUTS.forEach(n => $('#ff_' + n).value = ''); toast('Open Food Facts has no ' + (b === '100g' ? 'per-100 g' : 'per-serving') + ' values for this. Enter them or switch back.', 4000); } $('#ffQty').value = b === '100g' ? '' : 1; }
  updateFF();
};
$('#ffGroup').onchange = $('#ffNova').onchange = () => { updateFF(); const f = $('#foodForm'); f.querySelector('.swaps')?.remove(); f.querySelector('.total-line').insertAdjacentHTML('beforebegin', swapsHTML({ cats: ff.entry.categories, foodId: ff.entry.foodId, group: $('#ffGroup').value, nova: num($('#ffNova').value) })); };
$('#ffCancel').onclick = () => { $('#foodForm').hidden = true; ff = null; };
$('#foodForm').onsubmit = async e => {
  e.preventDefault(); if (!ff) return;
  const q = num($('#ffQty').value);
  if (q == null || q <= 0) { toast('Enter how much you ate'); $('#ffQty').focus(); return; }
  const base = ff.entry;
  const en = { id: ff.editId || uid(), ts: new Date($('#ffWhen').value || Date.now()).getTime(), name: $('#ffName').value.trim() || 'Food', brand: $('#ffBrand').value.trim(), barcode: base.barcode || '', source: base.source || 'manual',
    basis: $('#ffBasis').value, servingSize: $('#ffServing').value.trim(), per: readPer(), qty: q, categories: base.categories || [], foodId: base.foodId || null, group: $('#ffGroup').value, nova: num($('#ffNova').value),
    social: $('#ffSocial').checked, thumb: $('#ffKeepThumb').checked ? (ff.thumb || null) : null, ingredientsText: base.ingredientsText || '' };
  const pending = base.source === 'pending' && en.per.kcal == null;
  en.pendingLookup = pending;
  if (pending && !S.pendingScans.some(x => x.entryId === en.id)) { S.pendingScans.push({ entryId: en.id, code: en.barcode, ts: en.ts, qty: en.qty, savedAt: new Date().toISOString() }); }
  if (!pending) S.pendingScans = S.pendingScans.filter(x => x.entryId !== en.id);
  if (ff.editId) S.entries = S.entries.map(x => x.id === ff.editId ? en : x); else S.entries.push(en);
  await save('entries', 'pendingScans');
  await setFavorite(en, $('#ffFav').checked);
  if (ff.product) await queueProduct(ff.product);
  $('#foodForm').hidden = true; ff = null; setStatus($('#scanStatus'), ''); setStatus($('#ocrStatus'), '');
  toast(en.name + ' logged ✓'); viewDay = startOfDay(en.ts); show('today');
};
$('#manualBtn').onclick = () => openFoodForm({ name: '', source: 'manual', basis: 'serving', qty: 1 });

/* ---------- label photo + on-device OCR (Tesseract.js) ---------- */
function makeThumb(img, size = 112) { const c = document.createElement('canvas'); const s = Math.min(img.naturalWidth, img.naturalHeight); c.width = c.height = size; c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size); return c.toDataURL('image/jpeg', .72); }
function prepForOcr(img) { const max = 1800, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = img.naturalWidth * sc; c.height = img.naturalHeight * sc; const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(img, 0, 0, c.width, c.height); return c; }
let tessLoading = null;
function loadTesseract() { if (window.Tesseract) return Promise.resolve(); return tessLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('OCR engine failed to load')); document.head.appendChild(s); }); }
function parseLabel(text) {
  const t = text.replace(/\r/g, '').replace(/(\d)\s*[oO](?=\s*(g|mg)\b)/g, '$10');
  const g = (re) => { const m = t.match(re); return m ? num(m[1]) : null; };
  const out = {};
  out.kcal = g(/calories[^\d\n]{0,12}(\d{1,4})/i) ?? g(/(\d{1,4}(?:[.,]\d)?)\s*kcal/i);
  out.fat = g(/total\s*fat[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/\bfat[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i);
  out.satfat = g(/saturated(?:\s*fat)?[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/of\s*which\s*saturates[^\d\n]{0,8}(\d+(?:[.,]\d+)?)/i);
  out.carbs = g(/carbohydrates?[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i) ?? g(/\bcarbs?\b[^\d\n]{0,8}(\d+(?:[.,]\d+)?)/i);
  out.fiber = g(/fib(?:er|re)[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i);
  out.sugar = g(/(?:total\s*)?sugars?[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i);
  out.protein = g(/protein[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*g/i);
  const sm = t.match(/sodium[^\d\n]{0,8}(\d+(?:[.,]\d+)?)\s*(mg|g)/i); out.sodium = sm ? (sm[2].toLowerCase() === 'g' ? r1(num(sm[1]) * 1000) : num(sm[1])) : null;
  const ss = t.match(/serving\s*size[:\s]*([^\n]{1,40})/i);
  const basis = !ss && /per\s*100\s*(g|ml)/i.test(t) ? '100g' : 'serving';
  return { per: out, servingSize: ss ? ss[1].trim() : '', basis, found: Object.values(out).filter(v => v != null).length };
}
$('#labelFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const st = $('#ocrStatus'), url = URL.createObjectURL(file), img = $('#labelPreview');
  img.src = url; img.hidden = false; await img.decode().catch(() => {});
  const thumb = makeThumb(img);
  setStatus(st, 'Loading text reader (on this phone)…');
  try {
    await loadTesseract();
    const worker = await Tesseract.createWorker('eng', 1, { workerPath: new URL('vendor/worker.min.js', location.href).href, corePath: new URL('vendor/tesseract-core', location.href).href, langPath: new URL('vendor/tessdata', location.href).href, gzip: true, logger: m => { if (m.status === 'recognizing text') setStatus(st, 'Reading label… ' + Math.round(m.progress * 100) + '%'); } });
    const { data } = await worker.recognize(prepForOcr(img)); await worker.terminate();
    $('#ocrText').textContent = data.text; $('#ocrTextBox').hidden = false;
    const p = parseLabel(data.text);
    setStatus(st, p.found ? `Read ${p.found} value${p.found === 1 ? '' : 's'} from the label. Please check each number against the package.` : 'Could not read nutrition numbers. Enter them yourself (photo kept for reference).', p.found ? 'ok' : 'err');
    openFoodForm({ name: '', source: 'label', basis: p.basis, servingSize: p.servingSize, per: p.per, qty: 1, thumb }, { note: 'Prefilled by on-device text reading — verify before saving' });
  } catch (err) {
    setStatus(st, 'Text reading failed (' + (err.message || err) + '). ' + 'You can still enter values manually.', 'err');
    openFoodForm({ name: '', source: 'label', basis: 'serving', qty: 1, thumb }, {});
  }
};

/* ---------- sharing (Web Share → download → clipboard) ---------- */
async function shareJSON(obj, filename, title) {
  const text = JSON.stringify(obj, null, 2);
  const file = new File([text], filename, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; } }
  catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Saved ' + filename + ' to Downloads'); return 'downloaded'; }
  catch { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); return 'copied'; } catch { toast('Could not share or save the file'); return 'failed'; } }
}

/* ---------- weekly steps (data/weekly-plan.json) ---------- */
const matchesTarget = (e, key) => !!key && (e.foodId === key || e.group === key);
const labelFor = key => (R.foodById[key] && R.foodById[key].name) || GROUPS[key] || key;
function targetCount(t) { if (typeof t === 'number') return t; if (t && typeof t === 'object') return num(t.count ?? t.times ?? t.value); const m = String(t || '').match(/\d+/); return m ? +m[0] : null; }
function weekRange() { const w = R.weekly && R.weekly.weekOf; const from = w ? fromKey(String(w).slice(0, 10)) : startOfDay(addDays(new Date(), -6)); return { from, to: addDays(from, 7) }; }
function weeklySteps() { const W = R.weekly; if (!W || !Array.isArray(W.steps)) return []; return W.steps.map(st => ({ ...st, sources: st.sources && st.sources.length ? st.sources : W.sources, evidence: st.evidence || W.evidence, target: st.target ?? (String(st.successLooksLike || '').match(/at least (\d+)/) || [])[1] })).filter(hasSrc); }
function renderSteps() {
  const W = R.weekly, body = $('#stepsBody');
  $('#dataVersion').textContent = R.index && R.index.version ? 'Research data version ' + R.index.version + (R.index.updatedAt ? ' · updated ' + dayKey(R.index.updatedAt) : '') : 'No research data on this phone yet.';
  const steps = weeklySteps(); body.innerHTML = ''; if (steps.length) return; // research steps are offered inside 'My steps'
  if (!W || !steps.length) { body.innerHTML = `<div class="placeholder"><b>🪜 This week's steps: coming from research</b>Each week, small, sourced steps based on what you actually eat will appear here (for example, a swap to try a few times). Share a weekly check-in below to get them started.</div>`; return; }
  const { from, to } = weekRange();
  const es = S.entries.filter(e => e.ts >= from.getTime() && e.ts < to.getTime());
  body.innerHTML = `<div class="card enc">${W.encouragement ? esc(W.encouragement) : ''}<div class="sub">Week of ${fmtDay(from)}</div></div>` + steps.map(st => {
    const tgt = targetCount(st.target), done = es.filter(e => matchesTarget(e, st.swapTo)).length, fromN = st.swapFrom ? es.filter(e => matchesTarget(e, st.swapFrom)).length : null;
    const pct = tgt ? Math.min(100, 100 * done / tgt) : 0;
    return `<div class="card step${tgt && done >= tgt ? ' done' : ''}"><h3>${tgt && done >= tgt ? '✅ ' : ''}${esc(st.title)}</h3>${st.why ? `<div class="why">${esc(st.why)}</div>` : ''}
      ${st.swapFrom || st.swapTo ? `<div class="swap">${st.swapFrom ? esc(labelFor(st.swapFrom)) + ' → ' : ''}<b>${esc(labelFor(st.swapTo))}</b></div>` : ''}
      ${tgt ? `<div class="prog"><span>${done}/${tgt}</span><div class="bar"><div style="width:${pct}%"></div></div></div>` : ''}<div class="sub">${esc(typeof st.target === 'string' ? st.target : '')}${fromN != null ? ` · ${esc(labelFor(st.swapFrom))} logged ${fromN}× this week` : ''}</div>
      <div class="src">${evBadge(st)} ${srcLinks(st.sources)}</div></div>`;
  }).join('');
}

/* ---------- weekly check-in export ---------- */
function weeklyExport() {
  const from = startOfDay(addDays(new Date(), -6)), to = new Date();
  const es = S.entries.filter(e => e.ts >= from.getTime() && e.ts <= to.getTime()).sort((a, b) => a.ts - b.ts);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i), k = dayKey(d), de = es.filter(e => dayKey(e.ts) === k), groups = {};
    de.forEach(e => { const g = e.group || 'unassigned'; groups[g] = r1((groups[g] || 0) + (e.basis === '100g' ? e.qty / 100 : e.qty)); });
    days.push({ date: k, skipped: S.skips.filter(x => dayKey(x.ts) === k).map(x => x.slot), waterCups: S.water[k] ?? null, kcal: Math.round(de.reduce((a, e) => a + (entryKcal(e) || 0), 0)), entries: de.length, kcalUnknownEntries: de.filter(e => entryKcal(e) == null).length, groups, mealTimes: de.map(e => fmtTime(e.ts)), activity: S.dailyActivity[k] || null });
  }
  return {
    app: 'food-log', appVersion: APP_VER, exportedAt: new Date().toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, researchDataVersion: R.index && R.index.version || null,
    profile: exportProfile(),
    questionnaire: S.quiz ? { answers: S.quiz.answers, scores: S.quiz.scores, completedAt: S.quiz.completedAt, version: S.quiz.version ?? null } : null,
    week: { from: dayKey(from), to: dayKey(to), days },
    dailyActivity: Object.fromEntries(days.map(d => [d.date, d.activity])),
    skipReasonMap: QUIZ_SKIP_MAP,
    skippedMeals: S.skips.filter(k => k.ts >= from.getTime() && k.ts <= to.getTime()).map(k => ({ at: new Date(k.ts).toISOString(), localDate: dayKey(k.ts), slot: k.slot, reason: k.reason || null })),
    logs: es.map(e => ({ at: new Date(e.ts).toISOString(), localDate: dayKey(e.ts), localTime: fmtTime(e.ts), name: e.name, brand: e.brand || null, barcode: e.barcode || null, source: e.source, foodId: e.foodId || null, group: e.group || null,
      ateWithOthers: !!e.social, nova_group: e.nova ?? null, offCategories: e.categories || [], basis: e.basis, servingSize: e.servingSize || null, amount: e.qty, amountUnit: e.basis === '100g' ? 'g' : 'serving',
      kcal: entryKcal(e) == null ? null : Math.round(entryKcal(e)), nutrition: Object.fromEntries(NUTS.filter(n => n !== 'kcal').map(n => [NUT_EXPORT[n], r1(entryNut(e, n))])) })),
    processedShare: (() => { const n = novaShare(); return { kcalByNova: n.k, entriesWithNova: n.known, entriesWithoutNova: n.unknown }; })(),
    goals: goalsExport(),
    focusGoal: focusExport(),
    medas: S.medas.slice(-6),
    weights: S.weights.slice(-26).map(w => ({ at: new Date(w.ts).toISOString(), kg: w.kg })),
    weightTrend: weightLoss(),
    socialMeals: socialSummary(from),
    pendingOfflineScans: S.pendingScans.length,
    researchQueue: S.queue.filter(q => q.status === 'pending')
  };
}
$('#checkinBtn').onclick = async () => { const r = await shareJSON(weeklyExport(), 'food-log-checkin-' + dayKey(new Date()) + '.json', 'Food Log weekly check-in'); if (r === 'shared' || r === 'downloaded') { S.queue.forEach(q => { if (q.status === 'pending') q.status = 'sent'; }); await save('queue'); } };

/* ---------- guide ---------- */
function renderGuide() {
  const gl = groupsList().filter(hasSrc), foods = R.foods.filter(f => hasSrc(f));
  $('#guideIntro').innerHTML = gl.length || foods.length ? `<b>How much of each food group</b><div class="sub">From your research data${R.index && R.index.updatedAt ? ' (updated ' + esc(dayKey(R.index.updatedAt)) + ')' : ''}. Every item shows its sources and evidence strength. Items without sources are hidden.</div>`
    : `<div class="placeholder" style="margin:0"><b>🫒 Guidance coming from research</b>Food-group amounts, what to enjoy and what to limit, each with sources and evidence strength, will appear here once your research data arrives. Nothing is shown until it's sourced.</div>`;
  // today's groups
  const es = entriesOn(new Date()), cnt = {};
  es.forEach(e => { const g = e.group || 'unassigned'; cnt[g] = (cnt[g] || 0) + (e.basis === '100g' ? e.qty / 100 : e.qty); });
  $('#todayGroups').innerHTML = es.length ? `<div class="card"><b>Today by food group</b><ul class="sub" style="margin:6px 0 0;padding-left:18px">${Object.entries(cnt).map(([g, v]) => `<li>${esc(GROUPS[g] || 'Unassigned')}: ${r1(v)} ${'serving' + (v == 1 ? '' : 's')}</li>`).join('')}</ul><div class="sub">Counts logged servings (or per 100 g); research portion sizes may differ.</div></div>` : '';
  $('#guideGroups').innerHTML = Object.keys(GROUPS).map(gid => {
    const g = gl.find(x => (x.appGroup || x.id || x.group) === gid), fs = foods.filter(f => f.group === gid);
    if (!g && !fs.length) return '';
    const per = g ? [g.servings ? (g.servings.min != null && g.servings.max == null ? '≥' + g.servings.min : fmtRange(g.servings)) + ' servings/' + (g.servings.per || 'day') : '', g.servingsPerDay != null ? fmtRange(g.servingsPerDay) + ' servings/day' : '', g.servingsPerWeek != null ? fmtRange(g.servingsPerWeek) + ' servings/week' : '', g.portionDefinition ? g.portionDefinition : ''].filter(Boolean).join(' · ') : '';
    return `<div class="card group"><h3>${GROUPS[gid]}${g && g.rating ? `<span class="tag rate-${g.rating}">${RATING[g.rating] || esc(g.rating)}</span>` : ''}</h3>
      ${g ? `<div class="sub">${esc(per)}${g.notes ? ' · ' + esc(g.notes) : ''}</div><div class="src">${evBadge(g)} ${srcLinks(g.sources)}</div>` : ''}
      ${fs.length ? `<ul>${fs.map(f => `<li><b>${esc(f.name)}</b>${f.rating ? ` <span class="tag rate-${f.rating}">${RATING[f.rating]}</span>` : ''}${f.portion ? ` · ${esc([f.portion.amount, f.portion.unit].filter(x => x != null).join(' '))}${f.portion.household ? ' (' + esc(f.portion.household) + ')' : ''}` : ''}${f.frequency ? ` · ${esc(fmtRange([f.frequency.min, f.frequency.max]))}×/${esc(f.frequency.per)}` : ''}<div class="src">${evBadge(f)} ${srcLinks(f.sources)}</div></li>`).join('')}</ul>` : ''}</div>`;
  }).join('');
  renderQueue();
}
function fmtRange(v) { if (Array.isArray(v)) { const [a, b] = v; return a != null && b != null ? (a === b ? a : a + '–' + b) : (a ?? b ?? ''); } if (v && typeof v === 'object') return fmtRange([v.min, v.max]); return v; }
function renderQueue() {
  const q = S.queue;
  $('#queueList').innerHTML = q.length ? q.map(x => `<li><b>${esc(x.name || x.barcode)}</b>${x.brand ? ' · ' + esc(x.brand) : ''}${x.nova_group == 4 ? '<span class="upf">UPF</span>' : ''} <span class="tag">${x.status === 'sent' ? 'sent' : 'awaiting research'}</span></li>`).join('') : '<li class="sub">Nothing waiting. Scanned products with no research match show up here.</li>';
  $('#sendQueueBtn').disabled = !q.some(x => x.status === 'pending');
}
$('#sendQueueBtn').onclick = async () => { const items = S.queue.filter(x => x.status === 'pending'); const r = await shareJSON({ items }, 'food-log-research-queue-' + dayKey(new Date()) + '.json', 'Products for research'); if (r === 'shared' || r === 'downloaded' || r === 'copied') { items.forEach(x => x.status = 'sent'); await save('queue'); renderQueue(); } };
$('#clearQueueBtn').onclick = async () => { S.queue = S.queue.filter(x => x.status === 'pending'); await save('queue'); renderQueue(); };

/* ---------- questionnaire (data/questionnaire.json) ---------- */
function renderQuiz() {
  const Q = R.quiz, b = $('#quizBody');
  if (!Q || !Array.isArray(Q.sections) || !Q.sections.length) { b.innerHTML = `<div class="placeholder"><b>📝 Questionnaire coming from research</b>A short, research-based questionnaire about your eating habits will appear here once it's ready.</div><button class="btn big" id="qzBack">Back</button>`; $('#qzBack').onclick = () => show('today'); return; }
  const A = (S.quiz && S.quiz.answers) || {};
  const opt = (q, o, type) => `<label class="opt"><input type="${type}" name="q_${esc(q.id)}" value="${esc(o.value)}"${(Array.isArray(A[q.id]) ? A[q.id].includes(String(o.value)) : String(A[q.id]) === String(o.value)) ? ' checked' : ''}> ${esc(o.label ?? o.value)}</label>`;
  b.innerHTML = `<form id="quizForm"><p class="sub">Optional, about 5 minutes. Answers stay on your phone and are only included when you share a weekly check-in.${Q.disclaimer ? ' ' + esc(Q.disclaimer) : ''}</p>` + Q.sections.map(sec => `<div class="card"><h3 style="margin-top:0">${esc(sec.title)}</h3>${(sec.questions || []).map(q => `<div class="q"><div class="qt">${esc(q.text)}</div>${
    q.type === 'single' ? (q.options || []).map(o => opt(q, o, 'radio')).join('') :
    q.type === 'multi' ? (q.options || []).map(o => opt(q, o, 'checkbox')).join('') :
    q.type === 'scale' ? `<div class="scale">${(q.options || []).map(o => opt(q, o, 'radio')).join('')}</div>` :
    q.type === 'number' ? `<input name="q_${esc(q.id)}" inputmode="decimal" value="${esc(A[q.id] ?? '')}">` :
    `<textarea name="q_${esc(q.id)}" rows="2">${esc(A[q.id] ?? '')}</textarea>`}${q.source ? `<div class="src">${q.evidence ? evBadge(q) : ''}${typeof q.source === 'string' ? esc(q.source) : srcLinks([q.source])}</div>` : ''}</div>`).join('')}</div>`).join('') +
    `<div class="row"><button type="button" class="btn" id="qzSkip">Skip for now</button><button class="btn primary">Save answers</button></div></form>`;
  $('#qzSkip').onclick = () => show('today');
  $('#quizForm').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target), answers = {};
    Q.sections.forEach(sec => (sec.questions || []).forEach(q => { const v = q.type === 'multi' ? fd.getAll('q_' + q.id) : fd.get('q_' + q.id); if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) answers[q.id] = q.type === 'number' ? num(v) : v; }));
    S.quiz = { answers, scores: scoreQuiz(Q, answers), completedAt: new Date().toISOString(), version: Q.version ?? null }; S.quizHistory = [...(S.quizHistory || []), S.quiz].slice(-12); await save('quiz', 'quizHistory');
    toast('Answers saved on this phone'); show('today');
  };
}
function scoreQuiz(Q, answers) {
  const qs = {}; Q.sections.forEach(s => (s.questions || []).forEach(q => qs[q.id] = q));
  const val = id => { const q = qs[id], a = answers[id]; if (!q || a == null) return null; const sc = v => { const o = (q.options || []).find(o => String(o.value) === String(v)); return o && o.score != null ? +o.score : num(v); };
    return Array.isArray(a) ? a.reduce((s, v) => s + (sc(v) || 0), 0) : sc(a); };
  return (Q.scoring || []).map(sc => { const vals = (sc.items || []).map(val), answered = vals.filter(v => v != null); const sum = answered.reduce((a, b) => a + b, 0), mean = /\bmean\b/i.test(sc.description || ''); const score = answered.length ? (mean ? Math.round(100 * sum / answered.length) / 100 : sum) : null;
    const it = score == null ? null : (sc.interpretation || []).find(i => (i.min == null || score >= i.min) && (i.max == null || score <= i.max));
    return { id: sc.id, description: sc.description || '', score, answered: answered.length, of: vals.length, meaning: it ? it.meaning : null }; });
}
$('#quizBtn').onclick = () => { $('#settings').close(); renderQuiz(); show('quiz'); };

/* ---------- meal library + rotating plan ---------- */
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const library = () => [...R.meals.filter(hasSrc).filter(m => !mealBlocked(m)).map(m => ({ ...m, origin: 'research' })), ...S.myMeals.map(m => ({ ...m, origin: 'mine' }))];
const mealById = id => library().find(m => m.id === id);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/* Planner rules: 3-4 options per slot; no meal on back-to-back days; no main food twice in one day. */
const MINOR_GROUPS = ['herbs-spices', 'olive-oil-fats'];
function mainFoods(m) {
  if (Array.isArray(m.mainFoods) && m.mainFoods.length) return new Set(m.mainFoods.map(x => 'f:' + x));
  const ing = m.ingredients || [], ids = ing.filter(i => i.foodId && !MINOR_GROUPS.includes((R.foodById[i.foodId] || {}).group)).map(i => 'f:' + i.foodId);
  if (ids.length) return new Set(ids);
  return new Set(ing.length ? ['n:' + String(ing[0].name || '').toLowerCase()] : []);
}
const slotOf = m => m.slot || 'dinner';
function conflict(m, day, slot, prev, next) {
  if (prev && Object.values(prev.meals).includes(m.id)) return 'had yesterday';
  if (next && Object.values(next.meals).includes(m.id)) return 'planned tomorrow';
  const mf = mainFoods(m);
  for (const [s2, id] of Object.entries(day.meals)) { if (s2 === slot || !id) continue; const o = mealById(id); if (!o) continue; if (o.id === m.id) return 'already today'; for (const k of mainFoods(o)) if (mf.has(k)) return 'same main food as ' + s2; }
  return null;
}
function libSig() { return library().map(m => m.id + ':' + slotOf(m)).sort().join('|'); }
function makeOptions(day, prev) {
  const lib = library(); day.options = day.options || {};
  for (const slot of SLOTS) {
    const pool = lib.filter(m => slotOf(m) === slot); if (!pool.length) { delete day.options[slot]; continue; }
    const fresh = shuffle(pool.filter(m => !(prev && Object.values(prev.meals).includes(m.id))));
    const opts = (fresh.length ? fresh : shuffle(pool)).slice(0, 4).map(m => m.id);
    if (day.meals[slot] && !opts.includes(day.meals[slot])) opts[opts.length >= 4 ? 3 : opts.length] = day.meals[slot];
    day.options[slot] = opts;
  }
}
function autoFillDay(day, prev, next) {
  day.meals = {};
  for (const slot of SLOTS) {
    const opts = (day.options[slot] || []).map(mealById).filter(Boolean); if (!opts.length) continue;
    const ok = shuffle(opts).find(m => !conflict(m, day, slot, prev, next));
    const any = ok || shuffle(library().filter(m => slotOf(m) === slot)).find(m => !conflict(m, day, slot, prev, next));
    if (any) { day.meals[slot] = any.id; if (!day.options[slot].includes(any.id)) day.options[slot].push(any.id); }
  }
}
function newDays(start, n, prev) { const out = []; for (let i = 0; i < n; i++) { const d = { date: dayKey(addDays(start, i)), meals: {}, options: {} }; makeOptions(d, prev); autoFillDay(d, prev, null); out.push(d); prev = d; } return out; }
function researchWeekPlan() {
  const W = R.weekly; const mp = W && (Array.isArray(W.mealPlan) && W.mealPlan.length ? W.mealPlan : (W.referenceMenu && Array.isArray(W.referenceMenu.days) ? W.referenceMenu.days : null)); if (!mp || !mp.length) return null;
  const from = W.weekOf ? fromKey(String(W.weekOf).slice(0, 10)) : (S.planAnchor ? fromKey(S.planAnchor) : (S.planAnchor = dayKey(new Date()), save('planAnchor'), fromKey(S.planAnchor))); const today = dayKey(new Date());
  const days = mp.slice(0, 7).map((d, i) => { const meals = {}; const add = id => { const m = mealById(id); if (m) meals[slotOf(m)] = m.id; };
    if (typeof d === 'string') add(d); else if (Array.isArray(d)) d.forEach(add); else if (d && typeof d === 'object') Object.entries(d).forEach(([k, v]) => { if (SLOTS.includes(k) && mealById(v)) meals[k] = v; });
    return { date: d && d.date ? String(d.date).slice(0, 10) : dayKey(addDays(from, i)), meals, options: {} }; });
  const gap = Math.round((fromKey(days[0].date) - startOfDay(new Date())) / 86400000);
  if (gap > 0 && gap < 7) days.unshift(...newDays(startOfDay(new Date()), gap, null));
  if (!days.some(d => d.date >= today) || !days.some(d => Object.keys(d.meals).length)) return null;
  days.forEach((d, i) => { if (Object.keys(d.options || {}).length && i < (gap > 0 ? gap : 0)) return; makeOptions(d, days[i - 1]); for (const slot of SLOTS) if (!d.meals[slot] && (d.options[slot] || []).length) { const m = shuffle(d.options[slot].map(mealById).filter(Boolean)).find(m => !conflict(m, d, slot, days[i - 1], days[i + 1])); if (m) d.meals[slot] = m.id; } });
  return { start: days[0].date, mode: 'research', days, sig: 'research:' + (W.version ?? W.weekOf) + ':' + (W.revision ?? '') + ':' + (W.weekOf ?? '') };
}
function ensurePlan(force) {
  const lib = library(); if (!lib.length) { S.plan = null; return; }
  const sig = libSig(), mode = S.settings.planMode, today = startOfDay(new Date()), tk = dayKey(today);
  if (!force && (!S.plan || S.plan.mode !== 'research')) { const rp = researchWeekPlan(); if (rp && (!S.plan || S.plan.sig !== rp.sig)) { S.plan = rp; save('plan'); return; } }
  let p = S.plan;
  const lastPast = p ? p.days.filter(d => d.date < tk).slice(-1)[0] : null;
  if (force || !p || (p.mode !== 'research' && (p.sig !== sig || p.mode !== mode)) || (p.mode === 'research' && p.sig !== sig && !researchWeekPlan())) p = { start: tk, mode, sig, days: newDays(today, 7, lastPast) };
  else if (p.mode === 'weekly' && tk >= dayKey(addDays(fromKey(p.start), 7))) p = { start: tk, mode, sig, days: newDays(today, 7, lastPast) };
  else if (p.mode === 'daily' && p.start !== tk) { const days = p.days.filter(d => d.date >= tk); while (days.length < 7) { const prev = days[days.length - 1] || lastPast; days.push(...newDays(prev ? addDays(fromKey(prev.date), 1) : today, 1, prev)); } p = { ...p, start: tk, days }; }
  S.plan = p; save('plan');
}
function planDaysAhead() { const tk = dayKey(new Date()); return (S.plan ? S.plan.days : []).filter(d => d.date >= tk); }
function renderPlan() {
  ensurePlan();
  $('#planMode').value = S.settings.planMode; $('#planMode').disabled = !!(S.plan && S.plan.mode === 'research');
  const lib = library(), tk = dayKey(new Date()), all = S.plan ? S.plan.days : [];
  const resMeals = R.meals.filter(hasSrc);
  $('#libPlaceholder').innerHTML = resMeals.length ? '' : `<b>🍽️ Meal library coming from research</b>Sourced Mediterranean meals will be added here automatically. Meanwhile, add your own meals below and the planner will use them.`;
  $('#libPlaceholder').hidden = !!resMeals.length;
  const hidden = R.meals.filter(hasSrc).length - lib.filter(m => m.origin === 'research').length;
  $('#library').innerHTML = lib.map(m => `<li><div class="info"><b>${esc(m.name)}</b> <span class="tag">${esc(slotOf(m))}</span>${m.origin === 'mine' ? '<span class="tag">mine</span>' : ''}<div class="sub">${(m.ingredients || []).map(i => esc(i.name)).join(', ')}${m.kcalApprox != null ? ' · ~' + esc(m.kcalApprox) + ' kcal' : ''}</div>${m.origin === 'research' ? `<div class="src">${evBadge(m)} ${srcLinks(m.sources)}</div>` : ''}</div>${m.origin === 'mine' ? `<button class="icon-btn" data-del="${m.id}" aria-label="Delete">🗑️</button>` : ''}</li>`).join('') + (hidden > 0 ? `<li class="sub">🚫 ${hidden} meal${hidden === 1 ? '' : 's'} hidden because of your allergies / foods to avoid.</li>` : '');
  $('#planNote').innerHTML = !lib.length ? 'No meals yet. Add your own below or wait for research meals.' : (S.plan.mode === 'research' ? "This week's plan comes from your research update. " : (S.settings.planMode === 'weekly' ? 'New plan each week. ' : 'Rolls forward daily. ') ) + 'Tap a day to pick from the options. Rules: no meal on back-to-back days, no main food twice in a day.';
  const days = planDaysAhead();
  $('#planDays').innerHTML = days.map(d => { const i = all.indexOf(d), prev = all[i - 1], next = all[i + 1];
    return `<details class="day${d.date === tk ? ' today' : ''}"${d.date === tk ? ' open' : ''} data-date="${d.date}"><summary><h3>${d.date === tk ? 'Today · ' : ''}${fmtDay(fromKey(d.date))}</h3>${SLOTS.filter(s => d.meals[s]).map(s => `<div class="slot"><span class="k">${s}</span><span>${esc((mealById(d.meals[s]) || {}).name || '?')}</span></div>`).join('') || '<div class="sub">Nothing picked yet</div>'}</summary>
    ${SLOTS.filter(s => (d.options[s] || []).length).map(s => `<div class="opt-slot"><div class="k">${s}: choose one</div><div class="chips">${d.options[s].map(id => { const m = mealById(id); if (!m) return ''; const c = d.meals[s] === id ? null : conflict(m, d, s, prev, next); return `<button type="button" class="${d.meals[s] === id ? 'on' : ''}${c ? ' dim' : ''}" data-slot="${s}" data-id="${id}"${c ? ` title="${esc(c)}"` : ''}>${esc(m.name)}${c ? ` <small>(${esc(c)})</small>` : ''}</button>`; }).join('')}</div></div>`).join('')}</details>`; }).join('');
  renderPrep();
}
$('#planDays').onclick = async e => {
  const b = e.target.closest('button[data-slot]'); if (!b) return; const det = b.closest('[data-date]'); const all = S.plan.days, i = all.findIndex(d => d.date === det.dataset.date), d = all[i];
  const m = mealById(b.dataset.id), c = conflict(m, d, b.dataset.slot, all[i - 1], all[i + 1]);
  if (d.meals[b.dataset.slot] === m.id) delete d.meals[b.dataset.slot];
  else { if (c) return toast("Can't pick that: " + c); d.meals[b.dataset.slot] = m.id; }
  await save('plan'); renderPlan(); const again = $(`#planDays [data-date="${d.date}"]`); if (again) again.open = true;
};
$('#planMode').onchange = async () => { S.settings.planMode = $('#planMode').value; await save('settings'); ensurePlan(true); renderPlan(); };
$('#regenPlan').onclick = async () => { if (!S.plan) return toast('Add some meals first'); const all = S.plan.days, tk = dayKey(new Date()); all.forEach((d, i) => { if (d.date < tk) return; makeOptions(d, all[i - 1]); autoFillDay(d, all[i - 1], null); }); await save('plan'); renderPlan(); toast('Week filled ✨'); };
$('#library').onclick = async e => { const id = e.target.closest('[data-del]')?.dataset.del; if (!id) return; const m = S.myMeals.find(x => x.id === id); if (!m || !confirm('Delete "' + m.name + '"?')) return; S.myMeals = S.myMeals.filter(x => x.id !== id); await save('myMeals'); renderPlan(); };
$('#addMealBtn').onclick = () => { $('#mealForm').hidden = false; $('#mealForm').reset(); $('#mfName').focus(); };
$('#mfCancel').onclick = () => $('#mealForm').hidden = true;
const UNITS = /^(g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp|cans?|cloves?|pcs?|pieces?|slices?|handfuls?|bunch(es)?)$/i;
function parseIng(line) { line = line.trim(); const m = line.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(\S+)?\s*(.*)$/); if (!m) return { name: line, amount: null, unit: '' };
  let amount = m[1].includes('/') ? m[1].split('/').reduce((a, b) => a / b) : num(m[1]); if (m[2] && UNITS.test(m[2])) return { amount, unit: m[2].toLowerCase(), name: m[3] || '' }; return { amount, unit: '', name: [m[2], m[3]].filter(Boolean).join(' ') }; }
$('#mealForm').onsubmit = async e => { e.preventDefault(); S.myMeals.push({ id: 'my-' + uid(), name: $('#mfName').value.trim(), slot: $('#mfSlot').value, ingredients: $('#mfIng').value.split('\n').filter(l => l.trim()).map(parseIng), steps: $('#mfSteps').value.split('\n').filter(l => l.trim()), kcalApprox: null, sources: [] }); await save('myMeals'); $('#mealForm').hidden = true; ensurePlan(true); renderPlan(); toast('Meal added'); };

/* ---------- meal prep ---------- */
function combinedIngredients(days) {
  const map = new Map();
  for (const d of days) for (const id of Object.values(d.meals)) { const m = mealById(id); if (!m) continue;
    for (const i of (m.ingredients || [])) { const nm = (i.name || (i.foodId && R.foodById[i.foodId] && R.foodById[i.foodId].name) || '').trim(); if (!nm) continue; const key = nm.toLowerCase() + '|' + (i.unit || '').toLowerCase();
      const cur = map.get(key) || { name: nm, unit: i.unit || '', amount: 0, unknown: false, meals: new Set() }; const a = num(i.amount); if (a == null) cur.unknown = true; else cur.amount += a; cur.meals.add(m.name); map.set(key, cur); } }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const ingText = i => i.name + (i.amount ? ' — ' + r1(i.amount) + (i.unit ? ' ' + i.unit : '') + (i.unknown ? ' + more' : '') : '');
function renderPrep() {
  const days = planDaysAhead(), el = $('#prepCard');
  if (!days.length) { el.innerHTML = '<div class="sub">Add meals to build a plan; prep tasks and combined quantities will show here.</div>'; return; }
  const count = {}; days.forEach(d => Object.values(d.meals).forEach(id => count[id] = (count[id] || 0) + 1));
  const batch = Object.entries(count).filter(([id, n]) => n > 1 || (mealById(id) && mealById(id).prep && mealById(id).prep.batchCookable)).map(([id, n]) => { const m = mealById(id); const when = days.filter(d => Object.values(d.meals).includes(id)).map(d => fmtDay(fromKey(d.date)).split(',')[0]); return `<div class="prep-task">🍲 Batch-cook <b>${esc(m ? m.name : id)}</b> × ${n} portions <span class="sub">(${when.join(', ')})</span></div>`; });
  const ings = combinedIngredients(days), shared = ings.filter(i => i.meals.size > 1).map(i => `<div class="prep-task">🔪 Prep <b>${esc(i.name)}</b> once for: ${[...i.meals].map(esc).join(', ')}</div>`);
  el.innerHTML = `<b>Next ${days.length} days</b>${batch.length || shared.length ? batch.join('') + shared.join('') : '<div class="sub">No repeated meals or shared ingredients, so there is no batch prep this week.</div>'}
    <h3 style="font-size:16px;margin:12px 0 4px">Combined ingredients</h3>${ings.length ? `<ul class="sub" style="margin:0;padding-left:18px">${ings.map(i => `<li>${esc(ingText(i))}</li>`).join('')}</ul>` : '<div class="sub">These meals have no ingredients listed.</div>'}`;
}
$('#planToGrocery').onclick = async () => {
  const ings = combinedIngredients(planDaysAhead()); if (!ings.length) return toast('No plan ingredients to add');
  let added = 0; for (const i of ings) { const t = ingText(i); if (!S.grocery.some(g => !g.done && g.text.toLowerCase() === t.toLowerCase())) { S.grocery.push({ id: uid(), text: t, name: i.name, done: false, from: 'plan' }); added++; } }
  await save('grocery'); toast(added + ' item' + (added === 1 ? '' : 's') + ' added to grocery list'); show('grocery');
};

/* ---------- grocery ---------- */
function renderGrocery() {
  const GL = R.groceryLists, weeks = GL && Array.isArray(GL.weeks) ? GL.weeks : [];
  $('#resListRow').hidden = !weeks.length; if (weeks.length && !$('#resWeek').options.length) $('#resWeek').innerHTML = weeks.map(w => `<option value="${w.week}">Week ${w.week}</option>`).join('');
  $('#groceryList').innerHTML = S.grocery.map(g => `<li class="${g.done ? 'done' : ''}" data-id="${g.id}"><input type="checkbox"${g.done ? ' checked' : ''} aria-label="Got it"><span class="txt">${esc(g.text)}${g.backups && g.backups.length ? `<span class="backup">If out: ${g.backups.map(esc).join(' or ')}</span>` : ''}</span><button aria-label="Remove">✕</button></li>`).join('');
  $('#groceryEmpty').hidden = S.grocery.length > 0;
}
$('#groceryForm').onsubmit = async e => { e.preventDefault(); const t = $('#groceryInput').value.trim(); if (!t) return; S.grocery.push({ id: uid(), text: t, name: t, done: false }); $('#groceryInput').value = ''; await save('grocery'); renderGrocery(); };
$('#groceryList').onclick = async e => { const li = e.target.closest('li'); if (!li) return; const g = S.grocery.find(x => x.id === li.dataset.id); if (e.target.tagName === 'BUTTON') S.grocery = S.grocery.filter(x => x !== g); else if (e.target.type === 'checkbox' || e.target.classList.contains('txt')) g.done = !g.done; await save('grocery'); renderGrocery(); };
$('#loadResList').onclick = async () => {
  const w = (R.groceryLists.weeks || []).find(x => String(x.week) === $('#resWeek').value); if (!w) return; let added = 0, swapped = 0;
  for (const sec of w.sections || []) for (const it of sec.items || []) {
    let pick = it; const blocked = x => (x.allergens || []).map(normAllergen).some(a => userAllergens().includes(a)) || (x.foodId ? foodBlocked(R.foodById[x.foodId]) : excluded(x.name));
    if (blocked(it)) { pick = (it.backups || []).find(b => !blocked(b)); if (!pick) continue; swapped++; }
    const text = pick.name + (pick === it && it.approxQuantity ? ' — ' + it.approxQuantity.split(';')[0] : '');
    if (!S.grocery.some(g => g.name === pick.name && !g.done)) { S.grocery.push({ id: uid(), text, name: pick.name, backups: (it.backups || []).filter(b => b !== pick && !blocked(b)).map(b => b.name), section: sec.section, done: false, from: 'research-week-' + w.week }); added++; }
  }
  await save('grocery'); renderGrocery(); toast(`${added} items added${swapped ? ` (${swapped} swapped for your allergies)` : ''}`);
};
$('#clearChecked').onclick = async () => { S.grocery = S.grocery.filter(g => !g.done); await save('grocery'); renderGrocery(); };
$('#clearAll').onclick = async () => { if (!S.grocery.length || !confirm('Clear the whole list?')) return; S.grocery = []; await save('grocery'); renderGrocery(); };

/* ---------- store mode ---------- */
const storeScanner = new Scanner($('#storeVideo'), $('#storeMsg'), code => { storeCheck(code).finally(() => setTimeout(() => { if (!$('#storePanel').hidden) storeScanner.start(); }, 2500)); });
$('#storeBtn').onclick = () => { $('#storePanel').hidden = false; $('#storeBtn').hidden = true; $('#verdict').innerHTML = ''; storeScanner.start(); };
$('#storeClose').onclick = () => { storeScanner.stop(); $('#storePanel').hidden = true; $('#storeBtn').hidden = false; };
$('#storeForm').onsubmit = e => { e.preventDefault(); storeCheck($('#storeInput').value); };
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
const stem = w => w.replace(/(es|s)$/, '');
function matchGrocery(p, food) {
  const cats = (p.categories || []).filter(c => /^en:/.test(c)).map(c => c.slice(3).replace(/-/g, ' '));
  const pw = new Set([...words(p.name), ...cats.flatMap(words), ...(food ? [...words(food.name), ...(food.aliases || []).flatMap(words)] : [])].map(stem));
  return S.grocery.find(g => !g.done && words(g.name || g.text).some(w => pw.has(stem(w))));
}
async function storeCheck(code) {
  const v = $('#verdict'); v.innerHTML = '<div class="status">Looking up ' + esc(code) + '…</div>';
  let p; try { p = await offLookup(code); } catch (e) { v.innerHTML = `<div class="status err">${e.offline ? 'Offline and this product isn\'t saved on your phone yet. Check the label for now.' : 'Lookup failed: ' + esc(e.message)}</div>`; return; }
  if (!p.found) { v.innerHTML = `<div class="verdict mid"><h3>Not in Open Food Facts</h3><div class="sub">Barcode ${esc(code)}. Check the label yourself.</div></div>`; return; }
  const m = mapProduct(p.categories, p.name), rating = ratingFor(m.food && m.food.id, m.group), n = p.per100 || {};
  const item = matchGrocery(p, m.food); if (item) { item.done = true; await save('grocery'); renderGrocery(); }
  await queueProduct(p);
  const hits = productAllergyHits(p.allergens);
  const cls = hits.length || p.nova == 4 || rating === 'limit' ? 'bad' : rating === 'eat-freely' && (p.nova == null || p.nova <= 2) ? 'good' : 'mid';
  const ratedBy = m.food && rating ? m.food : (rating ? groupInfo(m.group) : null);
  v.innerHTML = `<div class="verdict ${cls}"><h3>${esc(p.name || code)}</h3><div class="sub">${esc(p.brand)}${m.group ? ' · ' + esc(GROUPS[m.group]) : ''}</div>${hits.length ? `<div class="upf-flag">🚫 Contains ${hits.map(a => esc(ALLERGENS[a] || a)).join(', ')} (your allergy list)</div>` : ''}
    <div style="margin-top:6px">${rating ? `<span class="tag rate-${rating}">${RATING[rating]}</span> ${evBadge(ratedBy)}` : '<span class="tag">No sourced rating yet</span>'} ${p.nova ? `<span class="tag ${p.nova == 4 ? 'rate-limit' : p.nova <= 2 ? 'rate-eat-freely' : 'rate-moderation'}">NOVA ${p.nova}${p.nova == 4 ? ' · ultra-processed' : ''}</span>` : '<span class="tag">NOVA unknown</span>'}</div>
    ${ratedBy && rating ? `<div class="src">${srcLinks(ratedBy.sources)}</div>` : ''}
    ${p.per100 ? `<div class="nut"><div><b>${n.kcal ?? '–'}</b>kcal</div><div><b>${n.sugar ?? '–'}g</b>sugar</div><div><b>${n.fiber ?? '–'}g</b>fiber</div><div><b>${n.sodium ?? '–'}mg</b>sodium</div><div><b>${n.fat ?? '–'}g</b>fat</div><div><b>${n.satfat ?? '–'}g</b>sat fat</div><div><b>${n.protein ?? '–'}g</b>protein</div><div><b>${n.carbs ?? '–'}g</b>carbs</div></div><div class="sub" style="text-align:center">per 100 g · Open Food Facts</div>` : '<div class="sub">No nutrition data on Open Food Facts.</div>'}
    ${item ? `<div class="status ok">✓ Checked off "${esc(item.text)}"</div>` : ''}${!m.food ? '<div class="sub">Added to research queue.</div>' : ''}
    ${swapsHTML({ cats: p.categories, foodId: m.food && m.food.id, group: m.group, nova: p.nova, storeItemId: item && item.id })}</div>`;
}

/* ---------- settings ---------- */
$('#settingsBtn').onclick = () => {
  $('#waterTargetInput').value = S.settings.waterTarget ?? ''; $('#waterFieldInput').value = S.settings.waterField ?? '';
  $('#targetInput').value = S.settings.target ?? ''; $('#targetMinInput').value = S.settings.targetMin ?? ''; $('#intervalInput').value = S.settings.intervalH ?? ''; $('#notifyInput').checked = !!S.settings.notify;
  $('#dataInfo').textContent = `${S.entries.length} entries stored on this phone only.`; $('#settings').showModal();
};
$('#saveSettings').onclick = async () => { S.settings.target = num($('#targetInput').value); S.settings.targetMin = num($('#targetMinInput').value); S.settings.intervalH = num($('#intervalInput').value); S.settings.waterTarget = num($('#waterTargetInput').value); S.settings.waterField = num($('#waterFieldInput').value); if (S.profile) S.profile.calorieTarget = S.settings.targetMin; await save('settings', 'profile'); if (curTab === 'today') renderToday(); };
$('#notifyInput').onchange = async e => { if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') { e.target.checked = false; toast('Notifications not allowed'); } } S.settings.notify = e.target.checked; await save('settings'); };
$('#exportBtn').onclick = () => shareJSON({ app: 'food-log', backupVersion: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(KEYS.map(k => [k, S[k]])) }, 'food-log-backup-' + dayKey(new Date()) + '.json', 'Food Log backup');
$('#importFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const j = JSON.parse(await f.text()); if (j.app !== 'food-log' || !j.data) throw new Error('Not a Food Log backup'); if (!confirm('Replace all data on this phone with this backup?')) return; for (const k of KEYS) if (j.data[k] !== undefined) S[k] = j.data[k]; await save(...KEYS); toast('Backup restored'); $('#settings').close(); show('today'); } catch (err) { toast('Import failed: ' + err.message); } };
let deferredPrompt = null; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
$('#installBtn').onclick = async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; } else $('#installHelp').hidden = !$('#installHelp').hidden; };

/* ---------- init ---------- */
(async () => {
  await DB.open(); await loadState(); await loadResearch();
  if (!S.profile) { fillProfile(); show('profile'); } else show('today');
  resolvePending();
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && navigator.onLine) { await loadResearch(); if (curTab !== 'add' && curTab !== 'profile' && curTab !== 'quiz') show(curTab); } });
  window.__fl = { mainFoods, mealById, library, S, R, save, show, weeklyExport, offLookup, parseLabel, lookupAndOpen, storeCheck, ensurePlan, addSwapToGrocery };
})();

/* ---------- resolve offline-queued barcodes when back online ---------- */
let resolving = false;
async function resolvePending() {
  if (resolving || !navigator.onLine || !S.pendingScans.length) return; resolving = true; let done = 0;
  try {
    for (const q of [...S.pendingScans]) {
      const e = S.entries.find(x => x.id === q.entryId);
      if (!e || !e.pendingLookup) { S.pendingScans = S.pendingScans.filter(x => x !== q); continue; }
      let p; try { p = await offFetch(q.code); } catch { break; }
      if (!p.found || (!p.perServing && !p.per100)) { e.pendingLookup = false; e.name = e.name.replace(' (lookup pending)', ' (not in Open Food Facts, please add values)'); e.source = 'manual'; e.needsReview = true; }
      else {
        S.offCache[q.code] = { ...p, cachedAt: Date.now() };
        const base = offToEntry(p);
        e.name = base.name || e.name; e.brand = base.brand; e.source = 'off'; e.servingSize = base.servingSize; e.categories = base.categories; e.foodId = base.foodId; e.group = e.group || base.group; e.nova = base.nova;
        if (p.perServing && p.perServing.kcal != null) { e.basis = 'serving'; e.per = { ...p.perServing }; }
        else if (p.servingQty) { e.basis = '100g'; e.per = { ...p.per100 }; e.qty = r1(e.qty * p.servingQty); }
        else { e.basis = '100g'; e.per = { ...p.per100 }; e.needsReview = true; }
        e.pendingLookup = false; await queueProduct(p);
      }
      S.pendingScans = S.pendingScans.filter(x => x !== q); done++;
    }
  } finally { resolving = false; await save('entries', 'pendingScans', 'offCache'); }
  if (done) { toast('Looked up ' + done + ' saved barcode' + (done === 1 ? '' : 's') + ' ✓'); if (curTab === 'today') renderToday(); }
}
window.addEventListener('online', () => { resolvePending(); loadResearch(); });

/* ---------- simple navigation helpers ---------- */
$('#bigAdd').onclick = () => { show('add'); renderQuick(); $('#foodForm').hidden = true; };
$('#addBack').onclick = () => { $('#foodForm').hidden = true; show('today'); };
$('#guideBack').onclick = () => show('progress');
$('#openGuide').onclick = () => show('guide');
$('#guideBtn').onclick = () => { $('#settings').close(); show('guide'); };

/* ---------- skipped meals ---------- */
const SKIP_R = { 'no-time': 'No time', 'no-appetite': 'No appetite', forgot: 'Forgot', 'no-food-available': 'No food available', other: 'Other' };
// questionnaire skip_reasons ids -> app log values (habits.json reasonMatch uses the app values)
const QUIZ_SKIP_MAP = { no_time: 'no-time', no_appetite: 'no-appetite', forget: 'forgot', no_food: 'no-food-available', other: 'other', in_field: null, stress: null };
let skipReason = null;
$('#skipBtn').onclick = () => { $('#skipPanel').hidden = !$('#skipPanel').hidden; skipReason = null; $$('#skipReasons button').forEach(b => b.classList.remove('on')); };
$('#skipReasons').onclick = e => { const b = e.target.closest('button'); if (!b) return; skipReason = skipReason === b.dataset.r ? null : b.dataset.r; $$('#skipReasons button').forEach(x => x.classList.toggle('on', x.dataset.r === skipReason)); };
$('#skipSlots').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const ts = dayKey(viewDay) === dayKey(new Date()) ? Date.now() : viewDay.getTime() + 12 * 3600000;
  S.skips.push({ id: uid(), ts, slot: b.dataset.s, reason: skipReason }); await save('skips'); $('#skipPanel').hidden = true; toast('Noted. Thanks for logging it 💚'); renderToday(); };

/* ---------- water ---------- */
function waterTarget() {
  const field = S.dailyActivity[dayKey(viewDay)] === 'field';
  const rules = [...((R.hydration && R.hydration.rules) || []), ...((R.timing && Array.isArray(R.timing.hydration)) ? R.timing.hydration : [])].filter(hasSrc);
  const r = rules.find(x => x.activity === (field ? 'field' : 'desk')) || rules.find(x => x.activity === 'any');
  if (r && r.cups != null) return { cups: r.cups, src: r };
  if (r && (r.beveragesMl || r.targetMl)) return { cups: Math.round((r.beveragesMl || r.targetMl) / 236.6), src: r, note: r.beveragesMl ? 'from drinks' : 'total water' };
  if (S.settings.waterTarget) return { cups: S.settings.waterTarget + (field && S.settings.waterField ? S.settings.waterField : 0), src: null };
  return null;
}
function renderWater() {
  const k = dayKey(viewDay), n = S.water[k] || 0, t = waterTarget();
  $('#waterCount').textContent = n;
  $('#waterSub').innerHTML = t ? `${n >= t.cups ? '✅ ' : ''}${n} of ~${t.cups} cups${t.note ? ' ' + t.note : ''}${S.dailyActivity[k] === 'field' ? ' (field day)' : ''}${t.src ? `<div class="src">${evBadge(t.src)} ${srcLinks(t.src.sources)}</div>` : ''}` : 'Cups today · set a target in ⚙️';
}
const addWater = async d => { const k = dayKey(viewDay); S.water[k] = Math.max(0, (S.water[k] || 0) + d); await save('water'); renderWater(); };
$('#waterPlus').onclick = () => addWater(1); $('#waterMinus').onclick = () => addWater(-1);

/* ---------- field-day packable snacks ---------- */
const isPackable = x => (x.tags || []).map(String).map(t => t.toLowerCase()).includes('packable') || !!(x.prep && x.prep.packable);
function renderFieldSnacks() {
  const el = $('#fieldSnacks');
  if (S.dailyActivity[dayKey(viewDay)] !== 'field') { el.innerHTML = ''; return; }
  const foods = R.foods.filter(f => hasSrc(f) && isPackable(f) && !foodBlocked(f));
  const addOn = new Set(((R.weekly && R.weekly.fieldDayAddOns && R.weekly.fieldDayAddOns.options) || []).map(o => o.mealId));
  const meals = R.meals.filter(m => hasSrc(m) && m.slot === 'snack' && (isPackable(m) || addOn.has(m.id)) && !mealBlocked(m)).sort((a, b) => addOn.has(b.id) - addOn.has(a.id));
  el.innerHTML = foods.length || meals.length ? `<div class="card"><b>🥾 Packable snacks for the field</b><ul class="snack-list">${[...meals, ...foods].slice(0, 6).map(x => `<li>${esc(x.name)}${x.kcalApprox ? ' · ~' + esc(x.kcalApprox) + ' kcal' : ''}${x.prep && x.prep.needsCooler ? ' · needs cooler' : ''}${x.portion && x.portion.household ? ' · ' + esc(x.portion.household) : ''} <span class="src">${evBadge(x)} ${srcLinks(x.sources)}</span></li>`).join('')}</ul></div>`
    : `<div class="placeholder"><b>🥾 Packable snacks</b>Field-day snack ideas will appear here once research data arrives.</div>`;
}

/* ---------- quick re-log: favorites + recent ---------- */
const favKey = e => (e.barcode ? 'b:' + e.barcode : 'n:' + String(e.name || '').toLowerCase().trim());
const template = e => ({ name: e.name, brand: e.brand || '', barcode: e.barcode || '', source: e.source === 'pending' ? 'manual' : e.source, basis: e.basis, servingSize: e.servingSize || '', per: { ...(e.per || {}) }, qty: e.qty, categories: e.categories || [], foodId: e.foodId || null, group: e.group || '', nova: e.nova ?? null, thumb: e.thumb || null });
async function setFavorite(e, on) { const k = favKey(e); S.favorites = S.favorites.filter(f => favKey(f) !== k); if (on) S.favorites.unshift(template(e)); await save('favorites'); }
function recentList() { const seen = new Set(), out = []; for (const e of [...S.entries].sort((a, b) => b.ts - a.ts)) { const k = favKey(e); if (seen.has(k) || e.pendingLookup) continue; seen.add(k); out.push(e); if (out.length >= 6) break; } return out; }
function renderQuick() {
  const favs = S.favorites, favK = new Set(favs.map(favKey)), rec = recentList().filter(e => !favK.has(favKey(e)));
  const row = (e, i, kind) => { const kc = entryKcal(e); return `<li><button class="qlog" data-kind="${kind}" data-i="${i}">${esc(e.name)}<small>${esc(e.basis === '100g' ? e.qty + ' g' : e.qty + ' serving' + (e.qty == 1 ? '' : 's'))}${kc != null ? ' · ' + Math.round(kc) + ' kcal' : ''} · tap to log</small></button><button class="star" data-kind="${kind}" data-i="${i}" aria-label="Favorite">${kind === 'fav' ? '★' : '☆'}</button></li>`; };
  $('#quickAdd').innerHTML = favs.length || rec.length ? `<div class="quick">${favs.length ? `<h3>⭐ Favorites</h3><ul>${favs.map((e, i) => row(e, i, 'fav')).join('')}</ul>` : ''}${rec.length ? `<h3 style="margin-top:10px">🕘 Recent</h3><ul>${rec.map((e, i) => row(e, i, 'rec')).join('')}</ul>` : ''}</div>` : '';
  quickCache = { fav: favs, rec };
}
let quickCache = { fav: [], rec: [] };
$('#quickAdd').onclick = async ev => {
  const b = ev.target.closest('button'); if (!b) return; const e = quickCache[b.dataset.kind][+b.dataset.i]; if (!e) return;
  if (b.classList.contains('star')) { await setFavorite(e, b.dataset.kind !== 'fav'); return renderQuick(); }
  const en = { ...template(e), id: uid(), ts: Date.now() }; S.entries.push(en); await save('entries');
  toast(en.name + ' logged ✓ (edit or delete it on Home)'); viewDay = startOfDay(Date.now()); show('today');
};

/* ---------- eating out (user estimate) ---------- */
let outThumb = null;
$('#outFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {}); outThumb = makeThumb(img); URL.revokeObjectURL(img.src); toast('Photo added'); };
$('#outBtn').onclick = () => { openFoodForm({ name: '', source: 'estimate', basis: 'serving', servingSize: 'my estimate', qty: 1, thumb: outThumb }, { note: 'Enter your best estimate of calories for the portion you ate' }); outThumb = null; $('#nutBox').open = true; };

/* ---------- allergies / dislikes: hard-exclude from plans, swaps, snacks ---------- */
const ALLERGENS = { milk: 'Milk', eggs: 'Eggs', fish: 'Fish', shellfish: 'Shellfish', 'tree-nuts': 'Tree nuts', peanuts: 'Peanuts', wheat: 'Wheat/gluten', soy: 'Soy', sesame: 'Sesame' };
const ALLERGEN_WORDS = { milk: ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'feta', 'parmesan', 'mozzarella', 'ricotta', 'kefir', 'whey'], eggs: ['egg'], fish: ['fish', 'salmon', 'tuna', 'sardine', 'cod', 'anchov', 'mackerel', 'trout', 'herring', 'tilapia'], shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'shellfish', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'octopus'], 'tree-nuts': ['almond', 'walnut', 'cashew', 'pistachio', 'hazelnut', 'pecan', 'tree nut', 'pine nut', 'macadamia', 'brazil nut', 'trail mix', 'mixed nuts'], peanuts: ['peanut', 'trail mix'], wheat: ['wheat', 'bread', 'pasta', 'couscous', 'bulgur', 'cracker', 'pita', 'farro', 'barley', 'rye', 'semolina', 'flour', 'cereal'], soy: ['soy', 'tofu', 'edamame', 'tempeh', 'miso'], sesame: ['sesame', 'tahini', 'hummus'] };
const ALLERGEN_GROUPS = { milk: ['dairy'], eggs: ['eggs'], fish: ['fish-seafood'] };
const normAllergen = a => { a = String(a || '').toLowerCase().replace(/^en:/, '').replace(/_/g, '-').trim(); return ({ egg: 'eggs', 'tree-nut': 'tree-nuts', nuts: 'tree-nuts', peanut: 'peanuts', gluten: 'wheat', 'wheat-gluten': 'wheat', soybeans: 'soy', soya: 'soy', 'sesame-seeds': 'sesame', crustaceans: 'shellfish', molluscs: 'shellfish', dairy: 'milk' })[a] || a; };
function userAllergens() { const p = S.profile || {}, A = (S.quiz && S.quiz.answers) || {}; const set = new Set((p.allergies || []).map(normAllergen)); (Array.isArray(A.allergies) ? A.allergies : []).filter(a => a !== 'none').forEach(a => set.add(normAllergen(a))); return [...set]; }
function exclusionTerms() {
  const t = new Set(), p = S.profile || {}, A = (S.quiz && S.quiz.answers) || {};
  userAllergens().forEach(a => (ALLERGEN_WORDS[a] || [a]).forEach(w => t.add(w)));
  [...(p.avoidFoods || []), ...csv(A.dislikes)].forEach(x => { x = x.toLowerCase().trim(); if (x && x !== 'none') t.add(x.replace(/s$/, '')); });
  return [...t];
}
const excluded = text => { const tx = String(text || '').toLowerCase(); return !!tx && exclusionTerms().some(w => tx.includes(w)); };
function foodBlocked(f) { if (!f) return false; const al = userAllergens(); if (al.some(a => (ALLERGEN_GROUPS[a] || []).includes(f.group))) return true; if ((f.allergens || []).map(normAllergen).some(a => al.includes(a))) return true; return excluded(f.name + ' ' + (f.aliases || []).join(' ')); }
function mealBlocked(m) { const al = userAllergens(); if ((m.allergens || []).map(normAllergen).some(a => al.includes(a))) return true; if ((m.ingredients || []).some(i => i.foodId && foodBlocked(R.foodById[i.foodId]))) return true; return excluded(m.name + ' ' + (m.ingredients || []).map(i => i.name).join(' ')); }
function productAllergyHits(tags) { const al = userAllergens(); return [...new Set((tags || []).map(normAllergen).filter(a => al.includes(a)))]; }

/* ---------- questionnaire-driven focus & phase ---------- */
const ansIn = (A, id, vals) => vals.includes(A[id]) || (Array.isArray(A[id]) && A[id].some(v => vals.includes(v)));
const scoreOf = (q, id) => { const s = q && (q.scores || []).find(x => x.id === id); return s ? s.score : null; };
function evalAdjustment(adj) {
  const Q = S.quiz; if (!Q) return null; const A = Q.answers || {}, t = adj.when || '', H = (S.quizHistory || []).slice(-2);
  const two = f => H.length >= 2 && H.every(f);
  const field = S.dailyActivity[dayKey(new Date())] === 'field' || (num(A.field_days_per_week) || 0) >= 1;
  if (/^\s*phase 2/i.test(t)) return two(h => scoreOf(h, 'snaq_total') >= 15 && ['0', '1-3'].includes((h.answers || {}).skip_frequency));
  if (/mna_weight_change/.test(t)) return ansIn(A, 'mna_weight_change', ['gt3kg', '1to3kg']) || A.mna_intake_change === 'severe' || two(h => scoreOf(h, 'snaq_total') != null && scoreOf(h, 'snaq_total') <= 14);
  if (/skip_frequency is '4-7'/.test(t)) return ansIn(A, 'skip_frequency', ['4-7', '8+']) || ansIn(A, 'snaq_4', ['a', 'b', 'c']);
  if (/aebq_satiety_responsiveness >= 4/.test(t)) return scoreOf(Q, 'aebq_satiety_responsiveness') >= 4 || ansIn(A, 'snaq_2', ['a', 'b']) || ansIn(A, 'skip_reasons', ['no_appetite']);
  if (/aebq_hunger < 3/.test(t)) { const h = scoreOf(Q, 'aebq_hunger'); return (h != null && h < 3) || ansIn(A, 'skip_reasons', ['forget']); }
  if (/field_hours_no_food/.test(t)) return field && ansIn(A, 'field_hours_no_food', ['2-4', '4-6', 'gt6']);
  if (/field_carry is 'pack'/.test(t)) return ansIn(A, 'field_carry', ['pack', 'pockets']);
  if (/field_carry is 'none'/.test(t)) return A.field_carry === 'none';
  if (/fluids_field/.test(t)) return ansIn(A, 'fluids_field', ['little', 'unsure']) || A.fluids_desk === 'lt4';
  if (/cooking_time/.test(t)) return ansIn(A, 'cooking_time', ['0', 'lt15']) || A.cooking_skill === 'low' || ansIn(A, 'cooking_access', ['none']);
  if (/budget is 'tight'/.test(t)) return A.budget === 'tight';
  if (/allergies is anything/.test(t)) return (Array.isArray(A.allergies) && A.allergies.some(a => a !== 'none')) || !!String(A.dislikes || '').trim();
  return null; // unknown rule: not shown
}
function adjustments() { return ((R.quiz && R.quiz.adjustments) || []).filter(hasSrc).map(a => ({ ...a, active: evalAdjustment(a) })); }
const isDocRule = a => /mna_weight_change/.test(a.when || ''), isPhase2 = a => /^\s*phase 2/i.test(a.when || ''), isPhase1 = a => /skip_frequency is '4-7'/.test(a.when || '');
function currentPhase() { const j = journey(); return j ? (j.phase === 'maintenance' ? 2 : j.phase) : null; }
function renderHomeAlerts() {
  let h = ''; const adj = adjustments(), wl = weightLoss(), doc = adj.find(a => isDocRule(a) && a.active) || (wl && wl.alert ? { ...R.targets.weightAlert, wl } : null), ph = currentPhase();
  if (doc) h += `<div class="alert doc">💙 <b>Worth a check-in with your doctor.</b> ${doc.wl ? (doc.wl.pct6 > (R.targets.weightAlert.lossPct || 5) && doc.wl.text ? esc(doc.wl.text) + ' ' : `Your weight trend is down about ${doc.wl.pct}% over ${doc.wl.months} months. `) : ''}${esc((R.quiz && R.quiz.disclaimer) || 'Ongoing appetite loss or weight loss without trying can have causes worth checking.')}<div class="src">${evBadge(doc)} ${srcLinks(doc.sources)}</div></div>`;
  if (ph) h += `<button class="phase-chip" id="phaseChip">${ph === 1 ? '🌱 Phase 1 · Regular meals first' : '🫒 Phase 2 · Swapping ultra-processed foods'} ›</button>`;
  else if (R.quiz && !S.quiz) h += `<button class="phase-chip" id="quizChip">📝 Take the 5-minute questionnaire ›</button>`;
  h += habitTips();
  $('#homeAlerts').innerHTML = h;
  $('#phaseChip') && ($('#phaseChip').onclick = () => show('progress'));
  $('#quizChip') && ($('#quizChip').onclick = () => { renderQuiz(); show('quiz'); });
}
$('#homeAlerts').addEventListener('click', async e => { const b = e.target.closest('[data-tip]'); if (!b) return; S.tipDismissed[b.dataset.tip] = dayKey(new Date()); await save('tipDismissed'); renderHomeAlerts(); });

/* ---------- habit tips (data/habits.json) ---------- */
function habitTips() {
  const ph = currentPhase() || 1;
  const rules = ((R.habits && R.habits.rules) || []).filter(hasSrc).filter(r => r.phase == null || r.phase === 'any' || String(r.phase).replace('phase', '') === String(ph)), now = Date.now(), out = [];
  for (const r of rules) {
    const tr = r.trigger || {}, from = now - (tr.window_days || 7) * 86400000; if (S.tipDismissed[r.id] === dayKey(new Date())) continue;
    let n = 0;
    if (tr.metric === 'skippedMeals') { const rm = r.reasonMatch == null ? null : [].concat(r.reasonMatch); n = S.skips.filter(k => k.ts >= from && (!rm || rm.includes(k.reason))).length; }
    else if (tr.metric === 'upfItems') n = S.entries.filter(e => e.ts >= from && e.nova == 4).length;
    else continue;
    const aa = allergyAware(r); if (!aa.ok) continue;
    const doc = /doctor/.test(r.id) && R.quiz && R.quiz.disclaimer;
    if (tr.threshold != null && n >= tr.threshold) out.push(`<div class="card tip${doc ? ' doc-tip' : ''}"><button class="x" data-tip="${esc(r.id)}" aria-label="Hide for today">✕</button><b>${doc ? '💙' : '💡'} ${esc(r.tip)}</b>${doc ? `<div class="sub" style="color:var(--ink)">${esc(R.quiz.disclaimer)}</div>` : ''}${allergyNotesHTML(aa.notes)}${r.why ? `<div class="sub">${esc(r.why)}</div>` : ''}<div class="src">${evBadge(r)} ${srcLinks(r.sources)}</div><div class="sub tiny">Shown because of your recent logs (an app suggestion, not a medical cutoff).</div></div>`);
    if (out.length >= 2) break;
  }
  return out.join('');
}

/* ---------- goals ---------- */
const GOAL_TYPES = {
  meals: { label: 'Eat meals regularly', unit: 'meals/day', def: 3, dir: 1, help: 'Meals or snacks logged per day (entries within 45 min count as one).' },
  minKcal: { label: 'Reach my calorie minimum', unit: 'days/week', def: 7, dir: 1, help: 'Days you reached your daily minimum (set in ⚙️).' },
  skips: { label: 'Fewer skipped meals', unit: 'skips/week', def: null, dir: -1, help: 'Meals marked as skipped.' },
  upf: { label: 'Fewer ultra-processed items', unit: 'items/week', def: null, dir: -1, help: 'Logged items with NOVA 4.' },
  vegetables: { label: 'More vegetables', unit: 'times/week', def: null, dir: 1, group: 'vegetables' },
  legumes: { label: 'More beans & legumes', unit: 'times/week', def: null, dir: 1, group: 'legumes' },
  fish: { label: 'More fish & seafood', unit: 'times/week', def: null, dir: 1, group: 'fish-seafood' },
  weight: { label: 'Weekly weigh-in (optional)', unit: 'lb', def: null, dir: 0, help: 'A neutral safety check, not a weight-loss goal.' }
};
function goals() { if (!S.goals) S.goals = [{ type: 'meals', target: 3 }, { type: 'minKcal', target: 7 }, { type: 'skips', target: null }, { type: 'upf', target: null }, { type: 'weight', target: null }]; return S.goals; }
function occasions(es) { const ts = es.map(e => e.ts).sort((a, b) => a - b); let n = 0, last = -Infinity; for (const t of ts) { if (t - last > 45 * 60000) n++; last = t; } return n; }
const wUnit = () => S.settings.units === 'metric' ? 'kg' : 'lb', toUser = kg => S.settings.units === 'metric' ? r1(kg) : r1(kg / 0.45359237);
function weekBounds(i) { const end = addDays(startOfDay(new Date()), 1 - 7 * i), from = addDays(end, -7); return { from, end }; }
function goalValue(g, i) {
  const { from, end } = weekBounds(i), f = from.getTime(), t = Math.min(end.getTime(), Date.now() + 1);
  const es = S.entries.filter(e => e.ts >= f && e.ts < t), T = GOAL_TYPES[g.type];
  const daysElapsed = Math.max(1, Math.min(7, Math.round((t - f) / 86400000)));
  if (!es.length && !['weight', 'skips'].includes(g.type) && i > 0 && !S.entries.some(e => e.ts < f)) return null;
  switch (g.type) {
    case 'meals': { let tot = 0; for (let d = 0; d < daysElapsed; d++) { const k = dayKey(addDays(from, d)); tot += occasions(es.filter(e => dayKey(e.ts) === k)); } return r1(tot / daysElapsed); }
    case 'minKcal': { const mn = S.settings.targetMin; if (!mn) return null; let n = 0; for (let d = 0; d < 7; d++) { const k = dayKey(addDays(from, d)); if (es.filter(e => dayKey(e.ts) === k).reduce((a, e) => a + (entryKcal(e) || 0), 0) >= mn) n++; } return n; }
    case 'skips': return S.skips.filter(k => k.ts >= f && k.ts < t).length;
    case 'upf': return es.filter(e => e.nova == 4).length;
    case 'weight': { const w = S.weights.filter(x => x.ts >= f && x.ts < t).sort((a, b) => b.ts - a.ts)[0]; return w ? toUser(w.kg) : null; }
    default: return T.group ? es.filter(e => e.group === T.group).length : null;
  }
}
function researchHint(g) { const T = GOAL_TYPES[g.type]; if (!T.group) return ''; const gi = groupInfo(T.group); if (!gi || !hasSrc(gi)) return ''; const sv = gi.servings || (gi.servingsPerWeek != null ? { ...(typeof gi.servingsPerWeek === 'object' ? gi.servingsPerWeek : { min: gi.servingsPerWeek }), per: 'week' } : null); if (!sv) return ''; return `Research suggests ${sv.min != null && sv.max == null ? '≥' + sv.min : esc(fmtRange(sv))} servings/${esc(sv.per || 'day')} ${evBadge(gi)}`; }
function chartSVG(vals, target, dir) {
  const W = 320, H = 90, n = vals.length, pad = 16, bw = (W - pad) / n - 6; const max = Math.max(1, target || 0, ...vals.filter(v => v != null)) * 1.15;
  const y = v => H - 18 - (v / max) * (H - 30);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly progress chart">`;
  if (target) out += `<line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="#3f7d4e" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${W - 2}" y="${y(target) - 3}" font-size="10" text-anchor="end" fill="#3f7d4e">goal ${target}</text>`;
  vals.forEach((v, i) => { const x = pad / 2 + i * ((W - pad) / n) + 3; const lbl = i === n - 1 ? 'now' : '-' + (n - 1 - i) + 'w';
    if (v != null) { const good = target ? (dir >= 0 ? v >= target : v <= target) : true; out += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(1, H - 18 - y(v))}" rx="4" fill="${good ? '#5f9e57' : '#c9d9c4'}"/><text x="${x + bw / 2}" y="${y(v) - 3}" font-size="10" text-anchor="middle" fill="#1f2a24">${v}</text>`; }
    out += `<text x="${x + bw / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="#66736b">${lbl}</text>`; });
  return out + '</svg>';
}
function lineSVG(pts) { // weight line
  if (pts.length < 1) return ''; const W = 320, H = 90, xs = pts.map(p => p.ts), ys = pts.map(p => p.v); const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, lo = Math.min(...ys) - 1, hi = Math.max(...ys) + 1;
  const X = t => 12 + (W - 24) * (x1 === x0 ? .5 : (t - x0) / (x1 - x0)), Y = v => H - 14 - (H - 28) * (v - lo) / (hi - lo);
  return `<svg viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="#3f7d4e" stroke-width="2.5" points="${pts.map(p => X(p.ts) + ',' + Y(p.v)).join(' ')}"/>${pts.map(p => `<circle cx="${X(p.ts)}" cy="${Y(p.v)}" r="3.5" fill="#3f7d4e"/>`).join('')}<text x="4" y="12" font-size="10" fill="#66736b">${hi - 1} ${wUnit()}</text><text x="4" y="${H - 2}" font-size="10" fill="#66736b">${lo + 1} ${wUnit()}</text></svg>`;
}
function renderGoals() {
  const gs = goals();
  $('#goalsBody').innerHTML = gs.map((g, gi) => {
    const T = GOAL_TYPES[g.type]; if (!T) return '';
    if (g.type === 'weight') { const pts = smoothedWeights().slice(-20).map(w => ({ ts: w.ts, v: toUser(w.trend) })); const last = pts[pts.length - 1]; const wl = weightLoss();
      return `<div class="card goal"><h3><span>⚖️ ${T.label}</span><span>${last ? last.v + ' ' + wUnit() : '—'}</span></h3><div class="sub">${g.target ? 'Goal ' + g.target + ' ' + wUnit() + ' · ' : ''}Weekly weigh-in, same morning each week. Line shows the smoothed trend.${wl ? ' Change over ' + wl.months + ' months: −' + wl.pct + '%' : ''}</div>${lineSVG(pts)}<form class="row" data-weight><input inputmode="decimal" placeholder="Today's weight (${wUnit()})"><button class="btn">Log</button></form></div>`; }
    const vals = Array.from({ length: 6 }, (_, i) => goalValue(g, 5 - i)), cur = vals[5], tgt = g.target;
    const unit = T.unit, met = tgt != null && cur != null && (T.dir >= 0 ? cur >= tgt : cur <= tgt);
    return `<div class="card goal"><h3><span>${met ? '✅ ' : ''}${T.label}</span><span>${cur ?? '—'}${tgt != null ? ' / ' + tgt : ''} <small class="sub">${unit}</small></span></h3><div class="sub">This week so far${T.help ? ' · ' + T.help : ''}${tgt == null ? ' · No target yet (tracking only)' : ''}</div>${researchHint(g) ? `<div class="sub">${researchHint(g)}</div>` : ''}${chartSVG(vals, tgt, T.dir)}</div>`;
  }).join('') || '<div class="empty">No goals yet.</div>';
  $$('#goalsBody form[data-weight]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const v = num(f.querySelector('input').value); if (!v) return; S.weights.push({ ts: Date.now(), kg: r1(S.settings.units === 'metric' ? v : v * 0.45359237) }); await save('weights'); renderGoals(); toast('Weight saved'); });
}
$('#editGoalsBtn').onclick = () => {
  const f = $('#goalsForm'), gs = goals();
  f.innerHTML = `<b>Pick your goals</b><div class="sub">Set a number to aim for, or leave it blank to just track.</div>` + Object.entries(GOAL_TYPES).map(([k, T]) => { const g = gs.find(x => x.type === k);
    return `<div class="goal-row"><input type="checkbox" data-g="${k}"${g ? ' checked' : ''}><span class="gname">${T.label}<br><small class="sub">${k === 'weight' ? 'goal in ' + wUnit() : T.unit}</small></span><input class="gt" data-t="${k}" inputmode="decimal" value="${g && g.target != null ? g.target : ''}" placeholder="${T.def ?? '—'}"></div>`; }).join('') + `<div class="row"><button type="button" class="btn" id="gCancel">Cancel</button><button class="btn primary">Save goals</button></div>`;
  f.hidden = false; $('#editGoalsBtn').hidden = true;
  $('#gCancel').onclick = () => { f.hidden = true; $('#editGoalsBtn').hidden = false; };
  f.onsubmit = async e => { e.preventDefault(); S.goals = $$('#goalsForm [data-g]').filter(c => c.checked).map(c => ({ type: c.dataset.g, target: num($(`#goalsForm [data-t="${c.dataset.g}"]`).value) ?? GOAL_TYPES[c.dataset.g].def })); await save('goals'); f.hidden = true; $('#editGoalsBtn').hidden = false; renderGoals(); };
};
function goalsExport() { return goals().map(g => ({ type: g.type, label: GOAL_TYPES[g.type] && GOAL_TYPES[g.type].label, unit: g.type === 'weight' ? wUnit() : GOAL_TYPES[g.type] && GOAL_TYPES[g.type].unit, target: g.target ?? null, thisWeek: goalValue(g, 0), lastWeek: goalValue(g, 1) })); }
function renderTodayGoals(es, total) {
  if (dayKey(viewDay) !== dayKey(new Date())) { $('#todayGoals').innerHTML = ''; return; }
  const chips = []; const mg = goals().find(g => g.type === 'meals'); const occ = occasions(es);
  if (mg) chips.push(`<span class="${mg.target && occ >= mg.target ? 'met' : ''}">🍽️ ${occ}${mg.target ? '/' + mg.target : ''} meals</span>`);
  const sk = S.skips.filter(k => dayKey(k.ts) === dayKey(new Date())).length; if (sk) chips.push(`<span>⏭️ ${sk} skipped</span>`);
  const upf = es.filter(e => e.nova == 4).length; if (goals().some(g => g.type === 'upf')) chips.push(`<span>${upf ? '⚠️ ' + upf + ' ultra-processed' : '🌿 0 ultra-processed'}</span>`);
  $('#todayGoals').innerHTML = chips.join('');
}

/* ---------- progress screen ---------- */
function renderProgress() {
  const ph = currentPhase(), adj = adjustments();
  const pa = adj.find(a => (ph === 2 ? isPhase2(a) : isPhase1(a)));
  $('#phaseCard').innerHTML = ph ? `<div class="card enc"><b>${ph === 1 ? '🌱 Phase 1: regular meals first' : '🫒 Phase 2: swapping ultra-processed foods'}</b>${pa ? `<div class="sub" style="color:var(--ink)">${esc(pa.effect)}</div>${allergyNotesHTML(allergyAware(pa).notes)}<div class="src">${evBadge(pa)} ${srcLinks(pa.sources)}</div>` : ''}</div>`
    : (R.quiz ? `<div class="card"><b>📝 Questionnaire</b><div class="sub">5 minutes. It tailors your plan and phase.</div><button class="btn primary big" id="pqBtn">Start questionnaire</button></div>` : '');
  $('#pqBtn') && ($('#pqBtn').onclick = () => { renderQuiz(); show('quiz'); });
  renderSteps(); renderFocusGoal(); renderGoals(); renderNova(); renderMedas(); renderSodium();
  const focus = adj.filter(a => a.active && !isDocRule(a) && !isPhase1(a) && !isPhase2(a)).map(a => ({ ...a, aa: allergyAware(a) })).filter(a => a.aa.ok);
  $('#focusBody').innerHTML = focus.length ? `<div class="card"><b>Tailored to your answers</b><ul class="focus snack-list">${focus.map(a => `<li>${esc(a.effect)}${allergyNotesHTML(a.aa.notes)}<div class="src">${evBadge(a)} ${srcLinks(a.sources)}</div></li>`).join('')}</ul></div>` : '';
}

/* ===== evidence-backed additions (values from data/targets.json, medas.json) ===== */
const T = k => { const t = R.targets && R.targets[k]; return t && hasSrc(t) ? t : null; };
const kgNow = () => { const w = [...S.weights].sort((a, b) => b.ts - a.ts)[0]; return w ? w.kg : (S.profile && S.profile.weightKg) || null; };
const dayEntries = d => entriesOn(d);
const sumNut = (es, n) => es.reduce((a, e) => a + (entryNut(e, n) || 0), 0);
const isField = d => S.dailyActivity[dayKey(d)] === 'field';
function lowAppetite() { const wk = Date.now() - 7 * 86400000; const sn = scoreOf(S.quiz, 'snaq_total'); return (sn != null && sn <= 14) || S.skips.some(k => k.ts >= wk && k.reason === 'no-appetite'); }
function regularEatingMet() { const g = goals().find(x => x.type === 'meals'); const tgt = (g && g.target) || 3; let n = 0; for (let i = 1; i <= 7; i++) if (occasions(dayEntries(addDays(new Date(), -i))) >= tgt) n++; return n >= 5; }
function proteinTarget(d) { const t = T('protein'), kg = kgNow(); if (!t || !kg) return null; const hi = isField(d) && t.fieldDayGPerKg ? Math.max(t.fieldDayGPerKg, t.gPerKgMax) : t.gPerKgMax; return { min: Math.round(t.gPerKgMin * kg), max: Math.round(hi * kg), perMeal: Math.max(t.perMealMinG || 0, Math.min(t.perMealMaxG || 999, Math.round((t.perMealGPerKg || 0) * kg))), t }; }
function proteinActive() { return !!T('protein') && (currentPhase() === 2 || regularEatingMet()); }
function fiberActive() { const t = T('fiber'); if (!t) return { on: false }; if (currentPhase() !== (t.phase || 2)) return { on: false }; if (lowAppetite()) return { on: false, paused: true }; return { on: true, t }; }
function mealProtein(es) { // protein per eating occasion
  const s = [...es].sort((a, b) => a.ts - b.ts), occ = []; let cur = null;
  for (const e of s) { if (!cur || e.ts - cur.last > 45 * 60000) { cur = { p: 0, last: e.ts }; occ.push(cur); } cur.p += entryNut(e, 'protein') || 0; cur.last = e.ts; }
  return occ.map(o => o.p);
}
function bar(label, val, goal, unit, cls = '', goalLabel) { const pct = goal ? Math.min(100, 100 * val / goal) : 0; return `<div class="nb ${cls}"><div class="nb-top"><span>${label}</span><b>${Math.round(val)}${goal ? ' / ' + (goalLabel || goal) : ''} ${unit}</b></div><div class="bar"><div style="width:${pct}%"></div></div></div>`; }
function renderNutri(es) {
  const el = $('#nutriBars'), out = [], d = viewDay;
  if (proteinActive()) { const pt = proteinTarget(d); if (pt) { const mp = mealProtein(es), hit = mp.filter(x => x >= pt.perMeal).length; out.push(bar('💪 Protein', sumNut(es, 'protein'), pt.min, 'g', '', `${pt.min}–${pt.max}`) + `<div class="sub nb-sub">${hit} of ${mp.length || 0} meals had ≥${pt.perMeal} g${isField(d) ? ' · field day: aim high' : ''} <span class="src">${evBadge(pt.t)} ${srcLinks(pt.t.sources)}</span></div>`); } }
  const so = T('sodium');
  if (so) { const v = sumNut(es, 'sodium'); if (isField(d) && (so.flagOnFieldDays === false || so.maxMgField === null)) out.push(`<div class="sub nb-sub">🧂 Sodium ${Math.round(v)} mg · ${esc(so.fieldNote || '')}</div>`); else out.push(bar('🧂 Sodium', v, so.maxMgDesk, 'mg', v > so.maxMgDesk ? 'warn' : 'neutral') + `<div class="sub nb-sub">Stay under ${so.maxMgDesk.toLocaleString()} mg on desk days <span class="src">${evBadge(so)} ${srcLinks(so.sources)}</span></div>`); }
  const fb = fiberActive();
  if (fb.on) out.push(bar('🌾 Fiber', sumNut(es, 'fiber'), fb.t.minG, 'g') + `<div class="sub nb-sub">Aim ${fb.t.minG}–${fb.t.maxG}+ g. ${esc(fb.t.text || '')} <span class="src">${evBadge(fb.t)} ${srcLinks(fb.t.sources)}</span></div>`);
  else if (fb.paused) out.push(`<div class="sub nb-sub">🌾 Fiber goal paused while appetite is low: total food comes first.</div>`);
  el.innerHTML = out.length ? `<details class="more nutri-box"${dayKey(d) === dayKey(new Date()) ? '' : ''}><summary>Nutrients today</summary>${out.join('')}<div class="sub tiny">From logged items with nutrition data; entries without values aren't counted.</div></details>` : '';
}
function renderHomeTips(es) {
  const out = [], today = dayKey(viewDay) === dayKey(new Date());
  if (!today) { $('#homeTips').innerHTML = ''; return; }
  const rc = T('recovery'), kg = kgNow();
  if (rc && isField(new Date())) { const b2b = isField(addDays(new Date(), -1)) || isField(addDays(new Date(), 1)); const g = kg ? `${Math.round(rc.proteinGPerKgMin * kg)}–${Math.round(rc.proteinGPerKgMax * kg)} g` : `~${rc.proteinApproxG} g`;
    const rr = rc.rapidRefuel, soon = S.settings.nextSessionSoon === dayKey(new Date());
    const refuel = rr && soon ? (kg ? `${Math.round(rr.carbGPerKgPerHourMin * kg)}–${Math.round(rr.carbGPerKgPerHourMax * kg)} g carbohydrate per hour` : `${rr.carbGPerKgPerHourMin}–${rr.carbGPerKgPerHourMax} g/kg carbohydrate per hour`) + ` for the first ${rr.forHours} h after finishing.` : '';
    out.push(`<div class="card tip"><b>🥾 Recovery meal within ~${rc.withinHours} h of finishing</b><div class="sub" style="color:var(--ink)">${esc(rc.text)} Protein: about ${g}.</div>${b2b ? `<div class="sub" style="color:var(--ink)">${esc(rc.backToBackText)}</div>` : ''}${rr ? (soon ? `<div class="sub" style="color:var(--ink)">⚡ Next session within ${rr.onlyIfNextSessionWithinHours} h: ${refuel}</div><button class="btn" id="soonOff" style="margin-top:6px">Not hiking again soon</button>` : `<button class="btn" id="soonOn" style="margin-top:8px">Hiking again within ${rr.onlyIfNextSessionWithinHours} h?</button>`) : ''}<div class="src">${evBadge(rc)} ${srcLinks(rc.sources)}</div></div>`); }
  const so = T('socialEating');
  if (so && lowAppetite()) out.push(`<div class="card tip"><b>👥 ${esc(so.text)}</b><div class="src">${evBadge(so)} ${srcLinks(so.sources)}</div></div>`);
  $('#homeTips').innerHTML = out.join('');
  $('#soonOn') && ($('#soonOn').onclick = async () => { S.settings.nextSessionSoon = dayKey(new Date()); await save('settings'); renderToday(); });
  $('#soonOff') && ($('#soonOff').onclick = async () => { S.settings.nextSessionSoon = null; await save('settings'); renderToday(); });
}

/* ---------- weight trend (smoothed) + safety signal ---------- */
function smoothedWeights() { const w = [...S.weights].sort((a, b) => a.ts - b.ts); let ema = null; return w.map(x => { ema = ema == null ? x.kg : ema + 0.3 * (x.kg - ema); return { ts: x.ts, kg: x.kg, trend: r1(ema) }; }); }
function weightLoss() {
  const t = T('weightAlert'); const sw = smoothedWeights(); if (!t || sw.length < 2) return null;
  const now = sw[sw.length - 1], m6 = Date.now() - (t.months || 6) * 30.44 * 86400000;
  const win = sw.filter(x => x.ts >= m6), peak6 = win.length >= 2 ? Math.max(...win.map(x => x.trend)) : null;
  const peakAll = Math.max(...sw.map(x => x.trend));
  const pct6 = peak6 ? r1(100 * (peak6 - now.trend) / peak6) : 0, pctAll = r1(100 * (peakAll - now.trend) / peakAll);
  const intended = t.excludeIfIntendedLoss !== false && (S.profile && (S.profile.goals || []).includes('lose-weight'));
  const hit6 = pct6 > t.lossPct, hitLong = t.lossPctBeyond6Months != null && pctAll > t.lossPctBeyond6Months;
  return { pct: hit6 ? pct6 : pctAll > pct6 ? pctAll : pct6, pct6, pctAll, alert: !intended && (hit6 || hitLong), months: hit6 || !hitLong ? t.months : 'more than ' + t.months, text: t.text || null };
}

/* ---------- pace-aware steps (data/pace.json): self-chosen, cue-tied, slow ---------- */
const PREF = { maxNewPerWeek: 1, maxUnmet: 2 }; // user's slower preference (never above pace.json caps)
const FOCUS_MENU = [
  { id: 'meals3', phase: 1, text: 'Eat 3 meals on {n} days', metric: 'meals3', def: 4, smaller: { text: 'Eat 3 meals on {n} days', def: 3 } },
  { id: 'breakfast', phase: 1, text: 'Eat breakfast on {n} days', metric: 'breakfast', def: 4, smaller: { text: 'Eat something within 1 hour of waking on {n} days', metric: 'breakfast', def: 3 } },
  { id: 'noskip', phase: 1, text: 'No skipped meals on {n} days', metric: 'noSkip', def: 3 },
  { id: 'minkcal', phase: 1, text: 'Reach my calorie minimum on {n} days', metric: 'minKcal', def: 3 },
  { id: 'veg', phase: 2, text: 'Have a vegetable on {n} days', metric: 'veg', def: 4 },
  { id: 'protein', phase: 2, text: 'Reach my protein minimum on {n} days', metric: 'protein', def: 3 }
];
const CUES = ['Right after morning coffee', 'At my lunch break', 'When I get back to the truck', 'When I get home from work'];
const weekStartKey = (d = new Date()) => dayKey(addDays(startOfDay(d), -((new Date(d).getDay() + 6) % 7)));
const paceRule = id => ((R.pace && R.pace.rules) || []).find(r => r.id === id && hasSrc(r));
const pacePhase = n => ((R.pace && R.pace.phases) || []).find(p => p.phase === n);
const gradRule = () => { const r = paceRule('step-graduation'); const m = r && r.rule.match(/(\d+)\s*of\s*(\d+)/); return m ? { k: +m[1], n: +m[2] } : { k: 6, n: 8 }; };
function focusDayMet(f, d) { const es = dayEntries(d);
  switch (f.metric) { case 'meals3': return occasions(es) >= 3; case 'breakfast': return es.some(e => new Date(e.ts).getHours() < 11);
    case 'minKcal': return !!S.settings.targetMin && es.reduce((a, e) => a + (entryKcal(e) || 0), 0) >= S.settings.targetMin;
    case 'noSkip': return es.length > 0 && !S.skips.some(k => dayKey(k.ts) === dayKey(d)); case 'veg': return es.some(e => e.group === 'vegetables');
    case 'protein': { const pt = proteinTarget(d); return !!pt && sumNut(es, 'protein') >= pt.min; }
    case 'swap': return es.length > 0 && !es.some(e => favKey(e) === f.fromKey);
    case 'researchStep': return es.some(e => matchesTarget(e, f.swapTo));
    case 'manual': return !!(S.stepChecks[f.id] || {})[dayKey(d)]; }
  return false; }
function stepWeeks(st) { // [{week, daysMet, met, current}]
  const out = []; let w = fromKey(st.startWeek); const cur = weekStartKey();
  while (dayKey(w) <= cur) { let n = 0; for (let i = 0; i < 7; i++) { const d = addDays(w, i); if (d <= new Date() && focusDayMet(st, d)) n++; } out.push({ week: dayKey(w), daysMet: n, met: n >= st.target, current: dayKey(w) === cur }); w = addDays(w, 7); }
  return out; }
function stepStatus(st) { const ws = stepWeeks(st), done = ws.filter(w => !w.current), g = gradRule(), lastN = done.slice(-g.n);
  if (lastN.length >= g.n && lastN.filter(w => w.met).length >= g.k) return 'established';
  const tail = done.slice(-3); if (tail.length === 3 && tail.every(w => !w.met) && !st.shrunk) return 'stuck';
  return 'active'; }
function stepFeedback(st) { const ws = stepWeeks(st), cur = ws[ws.length - 1], prev = ws[ws.length - 2];
  let t = `${cur.daysMet} of ${st.target} days this week`; if (prev) t += prev.met ? ' · last week: done ✓' : ` · last week: ${prev.daysMet}/${st.target}, it carries over (no reset)`; return t; }
function candidateSteps() {
  const ph = currentPhase() || 1, have = new Set(S.mySteps.map(s => s.id)), out = [];
    weeklySteps().forEach(x => { const t = (x.id + ' ' + x.title).toLowerCase(); const metric = x.swapTo ? 'researchStep' : /breakfast/.test(t) ? 'breakfast' : /vegetable/.test(t) ? 'veg' : /skip/.test(t) ? 'noSkip' : 'manual';
    out.push({ id: 'w:' + x.id, text: x.title + (x.target ? ` (${x.target} of 7 days)` : ''), metric, swapTo: x.swapTo, def: +x.target || targetCount(x.target) || 3, cue: x.cue, action: x.action, src: x }); });
  if (ph === 2) { // top ultra-processed items from logs -> same-type swap step
    const from = Date.now() - 28 * 86400000, cnt = {}; S.entries.filter(e => e.ts >= from && e.nova == 4).forEach(e => { const k = favKey(e); cnt[k] = cnt[k] || { e, n: 0 }; cnt[k].n++; });
    Object.values(cnt).sort((a, b) => b.n - a.n).slice(0, 3).forEach(({ e }) => { const sw = swapsFor({ cats: e.categories, foodId: e.foodId, group: e.group, nova: e.nova }); out.push({ id: 'swap:' + favKey(e), text: `Swap ${e.name}${sw && sw.items[0] ? ' for ' + sw.items[0].name : ' for a same-type option'} on {n} days`, metric: 'swap', fromKey: favKey(e), def: 3 }); });
  }
  FOCUS_MENU.filter(m => m.phase <= ph && (m.metric !== 'protein' || proteinActive())).forEach(m => out.push(m));
  return out.filter(c => !have.has(c.id)).slice(0, 3);
}
function journey() {
  if (!S.quiz && !S.entries.length) return null;
  const p1 = pacePhase(1) || { minWeeks: 4, typicalWeeks: 9 }, p2 = pacePhase(2) || { minWeeks: 8, typicalWeeks: 20 };
  if (!S.phaseLog.length) { S.phaseLog.push({ phase: 1, since: dayKey(new Date()) }); save('phaseLog'); }
  const cur = S.phaseLog[S.phaseLog.length - 1], weeksIn = Math.floor((Date.now() - fromKey(cur.since).getTime()) / (7 * 86400000));
  const H = (S.quizHistory || []).slice(-2), skipsWeek = i => { const { from, end } = weekBounds(i); return S.skips.filter(k => k.ts >= from.getTime() && k.ts < end.getTime()).length; };
  const p1Exit = H.length >= 2 && H.every(h => scoreOf(h, 'snaq_total') >= 15) && skipsWeek(1) <= 3 && skipsWeek(2) <= 3;
  const p1Fail = H.length >= 2 && H.every(h => scoreOf(h, 'snaq_total') != null && scoreOf(h, 'snaq_total') < 15) || (skipsWeek(1) > 3 && skipsWeek(2) > 3);
  let next = cur.phase;
  if (cur.phase === 1 && p1Exit && weeksIn >= p1.minWeeks) next = 2;
  else if (cur.phase !== 1 && p1Fail) next = 1;
  else if (cur.phase === 2 && weeksIn >= p2.minWeeks) { const swaps = S.mySteps.filter(s => s.metric === 'swap'); if (swaps.length && swaps.every(s => stepStatus(s) === 'established')) next = 'maintenance'; }
  if (next !== cur.phase) { S.phaseLog.push({ phase: next, since: dayKey(new Date()) }); save('phaseLog'); return journey(); }
  return { phase: cur.phase, weeksIn, p1, p2, since: cur.since };
}
function renderJourney() {
  const j = journey(); if (!j) return '';
  const hf = R.pace && R.pace.habitFormationDays, t1 = j.p1.typicalWeeks, t2 = j.p2.typicalWeeks, tot = t1 + t2;
  const lo = Math.floor(tot / 4.35), hi = Math.ceil((tot + t1) / 4.35);
  const pos = j.phase === 1 ? Math.min(t1, j.weeksIn) : j.phase === 2 ? t1 + Math.min(t2, j.weeksIn) : tot;
  return `<div class="card journey"><b>🧭 Your journey</b><div class="jbar"><div class="j1" style="flex:${t1}">Phase 1 · regular meals<br><small>~${t1} wks (min ${j.p1.minWeeks})</small></div><div class="j2" style="flex:${t2}">Phase 2 · swaps<br><small>~${t2} wks (min ${j.p2.minWeeks})</small></div><div class="j3" style="flex:6">Keep it up</div></div>
    <div class="jmark"><span style="left:${Math.min(97, 100 * pos / (tot + 6))}%">▲ you: ${j.phase === 'maintenance' ? 'maintenance' : 'phase ' + j.phase + ', week ' + (j.weeksIn + 1)}</span></div>
    <div class="sub">Estimate: each new habit takes about ${hf ? Math.round(hf.median / 30) : 2} months, and 4–5 months is normal. Overall about ${lo}–${hi} months. Varying week to week is normal.</div>
    ${hf && hasSrc(hf) ? `<div class="src">${evBadge(hf)} ${srcLinks(hf.sources)}</div>` : ''}${R.pace && R.pace.notes ? `<div class="sub tiny">Week counts and caps are app design choices informed by research, not validated cutoffs.</div>` : ''}</div>`;
}
function renderFocusGoal() {
  const el = $('#focusGoal'), j = journey(), ph = j ? j.phase : 1, pp = pacePhase(ph === 'maintenance' ? 2 : ph);
  const statuses = S.mySteps.map(s => ({ s, st: stepStatus(s), ws: stepWeeks(s) }));
  const active = statuses.filter(x => x.st !== 'established'), unmet = active.filter(x => { const done = x.ws.filter(w => !w.current); return done.length && !done[done.length - 1].met; }).length;
  const addedThisWeek = S.mySteps.filter(s => s.startWeek === weekStartKey()).length, cap = Math.min(PREF.maxNewPerWeek, pp ? pp.maxNewStepsPerWeek : 1);
  const canAdd = ph !== 'maintenance' && addedThisWeek < cap && unmet < PREF.maxUnmet;
  const why = !canAdd ? (ph === 'maintenance' ? 'Maintenance: no new steps unless you want one.' : addedThisWeek >= cap ? `One new step a week at most (your slower pace). Next one ${fmtDay(addDays(fromKey(weekStartKey()), 7))}.` : `Finish ${unmet} carried-over step${unmet === 1 ? '' : 's'} first, no rush.`) : '';
  const gs = T('goalSetting'), rsrc = [paceRule('self-chosen-steps'), paceRule('keep-unmet-steps'), paceRule('step-graduation')].filter(Boolean);
  el.innerHTML = renderJourney() + `<div class="card"><b>🪜 My steps</b>
    ${active.map(({ s, st, ws }) => `<div class="mystep"><div class="row between" style="margin:0"><b>${esc(s.text)}</b><button class="icon-btn" data-drop="${s.id}" aria-label="Remove step">✕</button></div><div class="sub">⏰ Cue: ${esc(s.cue || '—')}</div>${s.action ? `<div class="sub">${esc(s.action)}</div>` : ''}${s.metric === 'manual' ? `<button class="btn" data-check="${s.id}">${(S.stepChecks[s.id] || {})[dayKey(new Date())] ? '✓ Done today' : 'Did it today'}</button>` : ''}${s.sources ? `<div class="src">${evBadge(s)} ${srcLinks(s.sources)}</div>` : ''}<div class="week-dots">${Array.from({ length: 7 }, (_, i) => { const d = addDays(fromKey(weekStartKey()), i); return `<span class="${d > new Date() ? 'fut' : focusDayMet(s, d) ? 'met' : ''}">${d.toLocaleDateString([], { weekday: 'narrow' })}</span>`; }).join('')}</div><div class="sub">${esc(stepFeedback(s))}</div>${st === 'stuck' ? `<button class="btn" data-shrink="${s.id}">Make it smaller</button>` : ''}</div>`).join('') || '<div class="sub">No steps yet.</div>'}
    ${statuses.filter(x => x.st === 'established').map(({ s }) => `<div class="sub">✅ Established: ${esc(s.text)} (tracked quietly)</div>`).join('')}
    ${canAdd ? `<div class="sub" style="margin-top:10px">Pick one small step for this week:</div><div class="chips" id="stepPick">${candidateSteps().map((c, i) => `<button type="button" data-c="${i}">${esc(c.text.replace('{n}', c.def))}</button>`).join('')}</div><div id="cuePick" hidden><div class="sub" style="margin-top:8px">Tie it to a cue:</div><div class="chips">${CUES.map(c => `<button type="button" data-cue="${esc(c)}">${esc(c)}</button>`).join('')}</div><form class="row" id="cueForm"><input id="cueInput" placeholder="Or your own cue"><button class="btn primary">Start</button></form></div>` : `<div class="sub" style="margin-top:8px">${esc(why)}</div>`}
    <div class="sub tiny">Missed a day? No reset. Just pick up at the next meal.</div>
    ${rsrc.length || gs ? `<div class="src">${evBadge(gs || rsrc[0])} ${srcLinks([...(gs ? gs.sources : []), ...rsrc.flatMap(r => r.sources)].filter((x, i, a) => a.findIndex(y => y.url === x.url) === i))}</div>` : ''}</div>`;
  let chosen = null; const cands = canAdd ? candidateSteps() : [];
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { chosen = cands[+b.dataset.c]; el.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); $('#cuePick').hidden = false; if (chosen.cue) $('#cueInput').value = chosen.cue; });
  el.querySelectorAll('[data-cue]').forEach(b => b.onclick = () => { $('#cueInput').value = b.dataset.cue; });
  $('#cueForm') && ($('#cueForm').onsubmit = async e => { e.preventDefault(); if (!chosen) return; const cue = $('#cueInput').value.trim(); if (!cue) return toast('Pick or type a cue'); S.mySteps.push({ action: chosen.action || null, sources: chosen.src ? chosen.src.sources : null, evidence: chosen.src ? chosen.src.evidence : null, id: chosen.id, text: chosen.text.replace('{n}', chosen.def), metric: chosen.metric, fromKey: chosen.fromKey || null, swapTo: chosen.swapTo || null, target: chosen.def, cue, startWeek: weekStartKey(), phase: ph, smaller: chosen.smaller || null }); await save('mySteps'); renderFocusGoal(); toast('Step added. Small and steady 🌱'); });
  el.querySelectorAll('[data-check]').forEach(b => b.onclick = async () => { const m = S.stepChecks[b.dataset.check] = S.stepChecks[b.dataset.check] || {}, k = dayKey(new Date()); if (m[k]) delete m[k]; else m[k] = true; await save('stepChecks'); renderFocusGoal(); });
  el.querySelectorAll('[data-drop]').forEach(b => b.onclick = async () => { if (!confirm('Remove this step?')) return; S.mySteps = S.mySteps.filter(s => s.id !== b.dataset.drop); await save('mySteps'); renderFocusGoal(); });
  el.querySelectorAll('[data-shrink]').forEach(b => b.onclick = async () => { const s = S.mySteps.find(x => x.id === b.dataset.shrink); const sm = s.smaller; if (sm) { s.text = sm.text.replace('{n}', sm.def); s.target = sm.def; s.metric = sm.metric || s.metric; } else { s.target = Math.max(1, s.target - 1); s.text = s.text.replace(/\d+ days/, s.target + ' days'); } s.shrunk = true; s.startWeek = weekStartKey(); await save('mySteps'); renderFocusGoal(); });
}
function focusExport() { const j = journey(); return { journey: j ? { phase: j.phase, weeksInPhase: j.weeksIn, since: j.since } : null, steps: S.mySteps.map(s => ({ id: s.id, text: s.text, cue: s.cue, target: s.target, startWeek: s.startWeek, status: stepStatus(s), weeks: stepWeeks(s).map(w => ({ week: w.week, daysMet: w.daysMet, met: w.met })) })) }; }

/* ---------- MEDAS 14-item check (data/medas.json) ---------- */
function medasMax() { const it = medasItems() || []; const all = it.reduce((a, x) => a + (x.points ?? 1), 0); return S.settings.nonDrinker ? all - it.filter(x => x.excludeFromSuggestions && /wine|alcohol/i.test(x.id + x.short)).reduce((a, x) => a + (x.points ?? 1), 0) : all; }
function medasItems() { const M = R.medas; return M && Array.isArray(M.items) && hasSrc(M) ? M.items : null; }
function renderMedas() {
  const el = $('#medasCard'), items = medasItems(), last = S.medas[S.medas.length - 1];
  if (!items) { el.innerHTML = `<div class="placeholder"><b>🫒 Mediterranean score (MEDAS, 14 items)</b>A 2-minute check every 2 weeks, with a trend line. Questions are coming from research (U.S.-adapted wording).</div>`; return; }
  const due = !last || Date.now() - new Date(last.date).getTime() >= 13.5 * 86400000;
  const pts = S.medas.map((m, i) => m.score);
  el.innerHTML = `<div class="card"><b>🫒 Mediterranean score</b>${last ? ` <span class="sub">latest ${last.score}/${medasMax()}</span>` : ''}<div class="sub">Raw score and how it changes over time. There's no pass/fail line.</div><label class="check"><input type="checkbox" id="nonDrinker"${S.settings.nonDrinker ? ' checked' : ''}> I don't drink alcohol (max is 13, and that's fine)</label>${pts.length ? chartSVG(pts.slice(-6), null, 1) : ''}${due ? `<button class="btn primary big" id="medasStart">${last ? 'Time for your 2-week check' : 'Take the 2-minute check'}</button>` : `<div class="sub">Next check ${fmtDay(addDays(new Date(last.date), 14))}.</div>`}${last ? medasNoTips(last) : ''}<div class="src">${evBadge(R.medas)} ${srcLinks(R.medas.sources)}</div><form id="medasForm" hidden></form></div>`;
  $('#nonDrinker').onchange = async e => { S.settings.nonDrinker = e.target.checked; await save('settings'); renderMedas(); };
  $('#medasStart') && ($('#medasStart').onclick = () => {
    const f = $('#medasForm'); f.hidden = false; $('#medasStart').hidden = true;
    f.innerHTML = items.map(it => `<div class="q"><div class="qt">${esc(it.text)}</div><div class="slot-btns"><label class="opt"><input type="radio" name="m_${esc(it.id)}" value="yes"> Yes</label><label class="opt"><input type="radio" name="m_${esc(it.id)}" value="no"> No</label></div></div>`).join('') + `<button class="btn primary big">Save</button>`;
    f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f), answers = {}; items.forEach(it => answers[it.id] = fd.get('m_' + it.id)); const score = items.reduce((a, it) => a + (answers[it.id] === (it.pointWhen || 'yes') ? (it.points ?? 1) : 0), 0); S.medas.push({ date: new Date().toISOString(), answers, score, of: medasMax(), version: R.medas.version ?? null }); await save('medas'); renderMedas(); toast('Score saved: ' + score + '/' + medasMax()); };
  });
}
function medasNoTips(last) { const items = medasItems() || []; const misses = items.filter(it => last.answers[it.id] && last.answers[it.id] !== (it.pointWhen || 'yes') && !it.noTip && !it.excludeFromSuggestions).map(it => ({ ...it, aa: allergyAware(it) })).filter(it => it.aa.ok);
  if (!misses.length) return ''; return `<details class="more"><summary>Ideas for next time (${misses.length})</summary><ul class="snack-list">${misses.map(it => { const sw = it.foodId ? swapsFor({ foodId: it.foodId, group: R.foodById[it.foodId] && R.foodById[it.foodId].group }) : null; const g = it.group && R.foods.filter(f => f.group === it.group && f.rating === 'eat-freely' && hasSrc(f) && !foodBlocked(f)).slice(0, 3).map(f => f.name).join(', ');
    return `<li><b>${esc(it.short || it.text)}</b>${it.tip ? `<div>${esc(it.tip)}</div>` : ''}${allergyNotesHTML(it.aa.notes)}${g ? `<div class="sub">Try: ${esc(g)}</div>` : ''}${sw && sw.items.length ? `<div class="sub">Swap: ${sw.items.map(a => esc(a.name)).join(', ')}</div>` : ''}</li>`; }).join('')}</ul></details>`; }

/* ---------- sodium top sources (desk days) ---------- */
function renderSodium() {
  const so = T('sodium'), el = $('#sodiumCard'); if (!so) { el.innerHTML = ''; return; }
  const from = startOfDay(addDays(new Date(), -6)).getTime(), es = S.entries.filter(e => e.ts >= from && !isField(e.ts)), by = {};
  es.forEach(e => { const v = entryNut(e, 'sodium'); if (v == null) return; const k = e.name; by[k] = by[k] || { name: e.name, mg: 0, e }; by[k].mg += v; });
  const top = Object.values(by).sort((a, b) => b.mg - a.mg).slice(0, 3);
  el.innerHTML = top.length ? `<div class="card"><b>🧂 Top sodium sources · last 7 desk days</b><ul class="snack-list">${top.map(t => { const sw = swapsFor({ cats: t.e.categories, foodId: t.e.foodId, group: t.e.group, nova: t.e.nova }); return `<li>${esc(t.name)}: ${Math.round(t.mg)} mg${sw && sw.items.length ? `<div class="sub">Swap idea: ${sw.items.slice(0, 2).map(a => esc(a.name)).join(', ')}</div>` : ''}</li>`; }).join('')}</ul><div class="src">${evBadge(so)} ${srcLinks(so.sources)}</div></div>` : '';
}
function socialSummary(from) { const es = S.entries.filter(e => e.ts >= from.getTime()); const days = {}; es.forEach(e => { const k = dayKey(e.ts); days[k] = days[k] || { kcal: 0, social: false }; days[k].kcal += entryKcal(e) || 0; if (e.social) days[k].social = true; });
  const a = Object.values(days), s = a.filter(d => d.social), n = a.filter(d => !d.social), avg = x => x.length ? Math.round(x.reduce((p, d) => p + d.kcal, 0) / x.length) : null;
  return { socialEntries: es.filter(e => e.social).length, avgKcalDaysWithSharedMeal: avg(s), avgKcalOtherDays: avg(n) }; }

/* ---------- allergen-aware guidance text (allergens[] + alternativesIfAllergic) ---------- */
function allergyAware(obj) { // -> { ok, notes[] } ; ok=false means hide the item
  const ua = userAllergens(); if (!obj || !ua.length) return { ok: true, notes: [] };
  const tags = (obj.allergens || []).map(normAllergen), alts = obj.alternativesIfAllergic || {}, notes = [];
  for (const a of ua) { if (!tags.includes(a) && !(a === 'wheat' && (obj.allergens || []).includes('gluten'))) continue;
    const txt = alts[a] || (a === 'wheat' ? alts.gluten || alts.wheat : null) || Object.entries(alts).find(([k]) => normAllergen(k) === a)?.[1];
    if (!txt) return { ok: false, notes: [] }; notes.push({ a, txt }); }
  return { ok: true, notes };
}
const allergyNotesHTML = n => n.map(x => `<div class="allergy-alt">🚫 ${esc(ALLERGENS[x.a] || x.a)} allergy: ${esc(x.txt)}</div>`).join('');
