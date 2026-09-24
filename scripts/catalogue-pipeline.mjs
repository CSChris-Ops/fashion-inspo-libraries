#!/usr/bin/env node
// Catalogue pipeline for Fashion Inspo Libraries.
//
// 1. Reads every catalogue in data/catalogues/*.json plus data/lookboards.json.
// 2. Applies change files dropped into data/inbox/ (the same format the site's
//    "Export my changes" button produces), then moves them to data/inbox/applied/.
// 3. Overlays the manual verification ledger (data/catalogue.json).
// 4. Optionally checks every product link (--check-links) and marks dead ones.
// 5. Validates everything, then writes data/manifest.json (hashes the site uses
//    for delta sync), data/seed.js (offline/file:// first paint) and bumps the
//    service-worker cache version.
//
// Usage:
//   node scripts/catalogue-pipeline.mjs              build
//   node scripts/catalogue-pipeline.mjs --check      fail if outputs are stale (CI)
//   node scripts/catalogue-pipeline.mjs --check-links
//
// No dependencies; Node 18+.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const CHECK_LINKS = args.has('--check-links');
const SKIP_INBOX = args.has('--no-inbox') || CHECK;

const p = (...parts) => path.join(ROOT, ...parts);
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const nowISO = () => new Date().toISOString();

const SLOTS = ['outerwear', 'top', 'bottom', 'shoes', 'accessory'];
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const CATEGORIES = ['old-money', 'casual'];
const AVAILABILITY = ['listed', 'limited', 'unavailable', 'unknown'];

const errors = [];
const notes = [];
const fail = msg => errors.push(msg);

// ---------------------------------------------------------------- load
const catalogueDir = p('data', 'catalogues');
const catalogueFiles = fs.readdirSync(catalogueDir).filter(f => f.endsWith('.json')).sort();
const catalogues = new Map(catalogueFiles.map(f => {
  const data = readJSON(path.join(catalogueDir, f));
  return [data.id, { file: f, data, touched: false }];
}));
const lookboards = readJSON(p('data', 'lookboards.json'));
const ledgerPath = p('data', 'catalogue.json');
const ledger = fs.existsSync(ledgerPath) ? readJSON(ledgerPath) : { products: [] };

const findCatalogue = id => {
  const entry = catalogues.get(id);
  if (!entry) throw new Error(`unknown catalogue "${id}"`);
  entry.touched = true;
  return entry.data;
};

// ---------------------------------------------------------------- inbox
const PATCHABLE = {
  product: ['name', 'price', 'url', 'note', 'availability', 'image', 'worn', 'slot', 'facts'],
  formula: ['title', 'seasons', 'categories', 'image', 'rule', 'pieces', 'basket'],
  seasonal: ['title', 'occasion', 'full', 'lite', 'items', 'advice', 'image', 'range']
};
const collectionOf = kind => ({ product: 'products', formula: 'formulas', seasonal: 'seasonal' })[kind];

function applyChange(change) {
  const [kind, op] = String(change.op || '').split('.');
  if (kind === 'catalogue' && op === 'upsert') {
    const data = change.data;
    if (!data || !data.id) throw new Error('catalogue.upsert needs data.id');
    const existing = catalogues.get(data.id);
    catalogues.set(data.id, { file: existing ? existing.file : `${data.id}.json`, data, touched: true });
    return `catalogue ${data.id} upserted`;
  }
  const collection = collectionOf(kind);
  if (!collection) throw new Error(`unsupported op "${change.op}"`);
  const cat = findCatalogue(change.catalogue);
  const list = cat[collection] || (cat[collection] = []);
  const index = list.findIndex(x => x.id === (change.id || change.data?.id));
  if (op === 'remove') {
    if (index < 0) return `${kind} ${change.id} already absent`;
    list.splice(index, 1);
    return `${kind} ${change.id} removed from ${cat.id}`;
  }
  if (op === 'upsert') {
    if (!change.data?.id) throw new Error(`${change.op} needs data.id`);
    if (index < 0) list.push(change.data); else list[index] = { ...list[index], ...change.data };
    return `${kind} ${change.data.id} upserted in ${cat.id}`;
  }
  if (op === 'patch') {
    if (index < 0) throw new Error(`${kind} ${change.id} not found in ${cat.id}`);
    const fields = change.fields || {};
    for (const key of Object.keys(fields)) {
      if (!PATCHABLE[kind].includes(key)) throw new Error(`field "${key}" is not patchable on ${kind}`);
    }
    list[index] = { ...list[index], ...fields };
    return `${kind} ${change.id} patched in ${cat.id} (${Object.keys(fields).join(', ')})`;
  }
  throw new Error(`unsupported op "${change.op}"`);
}

if (!SKIP_INBOX) {
  const inboxDir = p('data', 'inbox');
  const appliedDir = path.join(inboxDir, 'applied');
  const inboxFiles = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter(f => f.endsWith('.json')).sort() : [];
  for (const file of inboxFiles) {
    const full = path.join(inboxDir, file);
    try {
      const bundle = readJSON(full);
      if (bundle.format !== 'fil-changes') throw new Error('format must be "fil-changes"');
      const changes = [...(bundle.changes || [])].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
      for (const change of changes) notes.push(`inbox/${file}: ${applyChange(change)}`);
      fs.mkdirSync(appliedDir, { recursive: true });
      fs.renameSync(full, path.join(appliedDir, file));
    } catch (error) {
      fail(`inbox/${file}: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------- ledger overlay
for (const record of ledger.products || []) {
  let matched = false;
  for (const entry of catalogues.values()) {
    const product = (entry.data.products || []).find(x => x.id === record.product_id);
    if (!product) continue;
    matched = true;
    const verified = {
      price: record.price, currency: record.currency, availability: record.availability,
      source_kind: record.source_kind, source_url: record.product_url, verified_at: record.verified_at
    };
    if (JSON.stringify(product.verified) !== JSON.stringify(verified)) {
      product.verified = verified;
      entry.touched = true;
    }
  }
  if (!matched) fail(`ledger: product_id "${record.product_id}" does not exist in any catalogue`);
}

// ---------------------------------------------------------------- link check
async function checkLinks() {
  const jobs = [];
  for (const entry of catalogues.values()) {
    for (const product of entry.data.products || []) jobs.push({ entry, product });
  }
  const probe = async url => {
    const attempt = async method => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, { method, redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'fashion-inspo-libraries-link-check/1.0' } });
        return res.status;
      } finally { clearTimeout(timer); }
    };
    try {
      let status = await attempt('HEAD');
      if (status === 405 || status === 403) status = await attempt('GET');
      return status;
    } catch { return 0; }
  };
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const { entry, product } = jobs[cursor++];
      const status = await probe(product.url);
      // Retail sites often block bots (403/429) — treat those as "unknown", never as dead.
      const state = status === 404 || status === 410 ? 'dead' : status >= 200 && status < 400 ? 'ok' : 'unverified';
      const previous = product.link_check?.state;
      if (previous !== state) {
        product.link_check = { state, status, checked_at: nowISO() };
        if (state === 'dead') product.availability = 'unavailable';
        if (state === 'ok' && product.availability === 'unavailable') product.availability = 'listed';
        entry.touched = true;
        notes.push(`link ${product.id}: ${previous || 'new'} -> ${state} (${status})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
if (CHECK_LINKS) await checkLinks();

// ---------------------------------------------------------------- validate
const isHttps = url => typeof url === 'string' && /^https:\/\//.test(url);
const assetExists = rel => typeof rel === 'string' && (isHttps(rel) || (rel.startsWith('assets/') && fs.existsSync(p(rel))));
const isMoney = m => m && Number.isFinite(m.amount) && m.amount >= 0 && /^[A-Z]{3}$/.test(m.currency);
const productIds = new Map();
const assets = new Set();
const useAsset = (where, rel) => { if (!assetExists(rel)) fail(`${where}: missing asset ${rel}`); else if (!isHttps(rel)) assets.add(rel); };

for (const { data: cat } of catalogues.values()) {
  const at = `catalogue ${cat.id}`;
  if (!/^[a-z0-9-]+$/.test(cat.id || '')) fail(`${at}: id must be kebab-case`);
  for (const key of ['label', 'currency', 'home_url']) if (!cat[key]) fail(`${at}: missing ${key}`);
  if (cat.home_url && !isHttps(cat.home_url)) fail(`${at}: home_url must be https`);
  if (cat.logo?.src) useAsset(`${at} logo`, cat.logo.src);
  const seen = new Set();
  const unique = (kind, id) => { if (!id) fail(`${at}: ${kind} without id`); else if (seen.has(id)) fail(`${at}: duplicate ${kind} id ${id}`); else seen.add(id); };
  for (const look of cat.seasonal || []) {
    unique('seasonal', look.id);
    if (!SEASONS.includes(look.season)) fail(`${at} ${look.id}: bad season ${look.season}`);
    if (!Number.isFinite(look.full) || !Number.isFinite(look.lite)) fail(`${at} ${look.id}: full/lite must be numbers`);
    useAsset(`${at} ${look.id}`, look.image);
    for (const item of look.items || []) {
      if (!item.name || !Number.isFinite(item.price)) fail(`${at} ${look.id}: item needs name and price`);
      if (!isHttps(item.url)) fail(`${at} ${look.id}: item url must be https (${item.name})`);
    }
  }
  for (const formula of cat.formulas || []) {
    unique('formula', formula.id);
    if (!formula.title) fail(`${at} ${formula.id}: missing title`);
    if (!formula.seasons?.length || formula.seasons.some(s => !SEASONS.includes(s))) fail(`${at} ${formula.id}: bad seasons`);
    if (!formula.categories?.length || formula.categories.some(c => !CATEGORIES.includes(c))) fail(`${at} ${formula.id}: bad categories`);
    if (!isMoney(formula.basket)) fail(`${at} ${formula.id}: basket must be {amount,currency}`);
    useAsset(`${at} ${formula.id}`, formula.image);
  }
  for (const product of cat.products || []) {
    unique('product', product.id);
    if (productIds.has(product.id)) fail(`${at}: product id ${product.id} also used by ${productIds.get(product.id)}`);
    productIds.set(product.id, cat.id);
    if (!SLOTS.includes(product.slot)) fail(`${at} ${product.id}: bad slot ${product.slot}`);
    if (!isMoney(product.price)) fail(`${at} ${product.id}: price must be {amount,currency}`);
    if (!isHttps(product.url)) fail(`${at} ${product.id}: url must be https`);
    if (product.availability && !AVAILABILITY.includes(product.availability)) fail(`${at} ${product.id}: bad availability`);
    useAsset(`${at} ${product.id}`, product.image);
    if (product.worn) useAsset(`${at} ${product.id} worn`, product.worn);
  }
}
for (const board of lookboards.boards || []) {
  useAsset(`lookboard ${board.id}`, board.model);
  for (const id of board.items || []) if (!productIds.has(id)) fail(`lookboard ${board.id}: unknown product ${id}`);
}
useAsset('studio base model', 'assets/tryon-base-model.png');

if (errors.length) {
  console.error(`\n✖ ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------- write
const outputs = new Map();
const entries = [...catalogues.values()].sort((a, b) => a.data.id.localeCompare(b.data.id));
const stamp = nowISO();
const manifestCatalogues = entries.map(entry => {
  if (entry.touched && !CHECK) entry.data.updated_at = stamp;
  const text = pretty(entry.data);
  const rel = `data/catalogues/${entry.file}`;
  outputs.set(rel, text);
  const d = entry.data;
  return {
    id: d.id, label: d.label, path: rel, hash: hash(text), updated_at: d.updated_at,
    counts: { seasonal: (d.seasonal || []).length, formulas: (d.formulas || []).length, products: (d.products || []).length }
  };
});
const lookboardText = pretty(lookboards);
outputs.set('data/lookboards.json', lookboardText);

const contentHash = hash(manifestCatalogues.map(c => c.hash).join('|') + hash(lookboardText));
const manifest = {
  schema_version: 2,
  content_hash: contentHash,
  generated_at: manifestCatalogues.map(c => c.updated_at).sort().at(-1),
  sync: { poll_seconds: 300 },
  catalogues: manifestCatalogues,
  lookboards: { path: 'data/lookboards.json', hash: hash(lookboardText) },
  assets: [...assets].sort()
};
const manifestText = pretty(manifest);
outputs.set('data/manifest.json', manifestText);

const seed = {
  manifest,
  catalogues: Object.fromEntries(entries.map(e => [e.data.id, e.data])),
  lookboards
};
outputs.set('data/seed.js',
  '// Generated by scripts/catalogue-pipeline.mjs — do not edit by hand.\n' +
  '// First-paint and file:// copy of every catalogue; the live copy is synced into IndexedDB.\n' +
  `window.__FIL_SEED__=${JSON.stringify(seed)};\n`);

const swPath = 'sw.js';
const sw = fs.readFileSync(p(swPath), 'utf8');
outputs.set(swPath, sw.replace(/const CACHE_VERSION='[^']*';/, `const CACHE_VERSION='fil-${contentHash}';`));

let stale = [];
for (const [rel, text] of outputs) {
  const full = p(rel);
  const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (current === text) continue;
  stale.push(rel);
  if (!CHECK) fs.writeFileSync(full, text);
}

for (const note of notes) console.log('•', note);
const totals = manifestCatalogues.reduce((t, c) => ({ s: t.s + c.counts.seasonal, f: t.f + c.counts.formulas, p: t.p + c.counts.products }), { s: 0, f: 0, p: 0 });
console.log(`✓ ${manifestCatalogues.length} catalogues · ${totals.s} seasonal looks · ${totals.f} formulas · ${totals.p} products · ${assets.size} assets · content ${contentHash}`);
if (CHECK && stale.length) {
  console.error(`✖ generated files are out of date: ${stale.join(', ')}\n  run: node scripts/catalogue-pipeline.mjs`);
  process.exit(1);
}
if (!CHECK) console.log(stale.length ? `wrote ${stale.join(', ')}` : 'no changes');
