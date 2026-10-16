// Henter nye sites fra feeds, oversætter kategorier til akserne og
// (valgfrit) lader Claude tagge farve, stemning, brand-udtryk og layout ud fra screenshottet.
// Kør: node scripts/fetch-feed.mjs   (kræver Node 20+, ingen pakker)
import { readFile, writeFile } from 'node:fs/promises';

const FEEDS = [
  { name: 'Siteinspire', url: 'https://www.siteinspire.com/websites/feed' },
  // Tilføj flere RSS-feeds her. Feeds uden billeder springes over.
];
const MAX_ITEMS = 600;          // hvor mange sites feedet maks gemmer
const MAX_AI_PER_RUN = 40;      // loft over Claude-kald per kørsel
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const KEY = process.env.ANTHROPIC_API_KEY;

const MAP = {
  'Big Type': 'brand:typo', 'Typographic': 'brand:typo', 'Typography': 'brand:typo',
  'Animation & Moving Image': 'brand:motion', 'Videos': 'brand:motion',
  'Editorial': 'brand:redak', 'Magazines': 'brand:redak', 'Publishing': 'brand:redak',
  'Illustration': 'brand:illu', 'Colourful': 'brand:farve', 'Colorful': 'brand:farve',
  'Grid Layout': 'layout:grid', 'Unusual Layout': 'layout:utrad',
  'Travel': 'branche:rejser', 'Hotels & Venues': 'branche:rejser',
  'Property & Real Estate': 'branche:bolig', 'Property': 'branche:bolig', 'Architecture': 'branche:bolig',
  'Interior Design': 'branche:bolig', 'Furniture': 'branche:bolig', 'Architectural & Building Products': 'branche:bolig',
  'Monochrome': 'farve:mono', 'Black & White': 'farve:mono',
  'Luxury': 'stemning:luksus', 'Minimal': 'stemning:minimal',
};
const EMNE = {
  'Culture': 'Kultur', 'History': 'Historie', 'Non-profit & Charity': 'Nonprofit', 'Consumer': 'Forbrug',
  'Cosmetics & Skincare': 'Kosmetik', 'E-Commerce': 'E-handel', 'Environment & Sustainability': 'Bæredygtighed',
  'Tech Start-ups': 'Tech', 'Technology': 'Tech', 'PR': 'PR', 'Photography': 'Fotografi',
  'Agencies & Consultancies': 'Bureau', 'Music': 'Musik', 'Music Network': 'Musik', 'Design & Art Direction': 'Design',
  'Marketing & Branding': 'Branding', 'Portfolio': 'Portfolio', 'Movies': 'Film', 'Entertainment': 'Underholdning',
  'Fashion': 'Mode', 'Advertising': 'Reklame', 'Food & Drink': 'Mad-og-drikke', 'Cafés, Bars & Restaurants': 'Café',
  'Sports': 'Sport', 'Corporate': 'Corporate', 'Business & Finance': 'Erhverv', 'Legal': 'Jura',
  'Product Catalogues & Collections': 'Katalog', 'Type Foundry': 'Typestøberi', 'Personal': 'Personlig',
  'Web & Interactive Design': 'Web', 'Web & App Development': 'Web', 'Art': 'Kunst', 'Product Design': 'Produktdesign',
  'Building & Construction': 'Byggeri', 'Creative Showcase': 'Showcase',
};
const ALLOWED = {
  brand: ['typo', 'farve', 'illu', 'motion', 'redak'],
  layout: ['full', 'split', 'grid', 'kort', 'utrad'],
  farve: ['varm', 'kolig', 'jord', 'mono', 'neon', 'pastel', 'dyb'],
  stemning: ['luksus', 'legende', 'minimal', 'raa', 'rolig'],
};

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

function parse(xml, source) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => {
    const get = t => { const r = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return r ? decode(r[1]) : ''; };
    const cats = [...x.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map(c => decode(c[1]));
    const credit = [...new Set([...x.matchAll(/<dc:creator>([\s\S]*?)<\/dc:creator>/g)].map(c => decode(c[1])))].join(', ');
    const media = [...x.matchAll(/<media:content[^>]*?url="([^"]+)"[^>]*?height="(\d+)"/g)].map(m => ({ url: decode(m[1]), h: +m[2] }));
    const enc = x.match(/<enclosure[^>]*url="([^"]+)"/) || get('description').match(/<img[^>]*src="([^"]+)"/);
    const wide = media.find(m => m.h < 1400)?.url || media[0]?.url || (enc && decode(enc[1]));
    const sq = media.find(m => m.h >= 1400)?.url || wide;
    const link = get('link');
    const tags = [];
    for (const c of cats) {
      const t = MAP[c] || 'emne:' + (EMNE[c] || c.replace(/\s+/g, '-'));
      if (!tags.includes(t)) tags.push(t);
    }
    return { id: link, title: get('title'), url: link, credit, source, sq, img: wide, tags, ai: false,
      date: get('pubDate') ? new Date(get('pubDate')).toISOString() : new Date().toISOString() };
  }).filter(i => i.id && i.img);
}

const PROMPT = `Du ser et screenshot af en website-forside. Tag designet på disse akser.
Svar KUN med JSON, ingen anden tekst:
{"brand":[...],"layout":[...],"farve":[...],"stemning":[...]}
Tilladte værdier (vælg 1-2 per akse, kun det der tydeligt passer):
brand: typo (udtryksfuld typografi), farve (stærk farveidentitet), illu (illustration/grafiske elementer), motion (tydelige animations-/bevægelseselementer), redak (redaktionelt layout)
layout: full (fuldt billede/hero), split, grid, kort (kort-baseret), utrad (utraditionelt)
farve: varm, kolig, jord (jordfarver), mono (monokrom), neon (mættet), pastel, dyb (dyb og mørk)
stemning: luksus, legende, minimal, raa (rå/brutalistisk), rolig`;

async function aiTag(it) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'url', url: it.img } },
      { type: 'text', text: PROMPT },
    ] }] }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = await r.json();
  const o = JSON.parse(j.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim());
  for (const a in ALLOWED) for (const v of [].concat(o[a] || [])) {
    if (ALLOWED[a].includes(v) && !it.tags.includes(`${a}:${v}`)) it.tags.push(`${a}:${v}`);
  }
  it.ai = true;
}

let data = { items: [] };
try { data = JSON.parse(await readFile('feed.json', 'utf8')); } catch {}
const byId = new Map(data.items.map(i => [i.id, i]));
let added = 0;
for (const f of FEEDS) {
  try {
    const xml = await (await fetch(f.url, { headers: { 'user-agent': 'inspirationsfeed (personlig RSS-læser)' } })).text();
    for (const it of parse(xml, f.name)) if (!byId.has(it.id)) { byId.set(it.id, it); added++; }
  } catch (e) { console.error(`Kunne ikke hente ${f.name}:`, e.message); }
}
let tagged = 0;
if (KEY) {
  for (const it of byId.values()) {
    if (it.ai || tagged >= MAX_AI_PER_RUN) continue;
    try { await aiTag(it); tagged++; } catch (e) { console.error(`Tagging fejlede for ${it.title}:`, e.message); }
  }
} else console.log('Ingen ANTHROPIC_API_KEY: springer Claude-tagging over.');

const items = [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, MAX_ITEMS);
await writeFile('feed.json', JSON.stringify({ updated: new Date().toISOString(), items }, null, 1));
console.log(`${added} nye, ${tagged} tagget med Claude, ${items.length} i alt.`);
