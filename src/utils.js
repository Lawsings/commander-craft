// Fichier: utils.js

/***************** Scryfall API *****************/
export const sf = {
  async search(q, opts = {}) {
    const params = new URLSearchParams({ q, unique: opts.unique || "cards", order: opts.order || "random" });
    const r = await fetch(`https://api.scryfall.com/cards/search?${params}`);
    if (!r.ok) throw new Error(`Scryfall ${r.status}`);
    return r.json();
  },
  async random(q) {
    const r = await fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`Scryfall ${r.status}`);
    return r.json();
  },
  async namedExact(n) {
    const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`);
    if (!r.ok) throw new Error(`Nom introuvable: ${n}`);
    return r.json();
  },
};

/***************** Constantes et Utilitaires *****************/
export const MECHANIC_TAGS = [
  // Catégorie S
  { key: "+1+1", label: "+1/+1 Counters", category: "S", matchers: ["+1/+1 counter", "proliferate", "evolve", "outlast"] },
  { key: "artifacts", label: "Artifacts Matter", category: "S", matchers: ["artifact you control", "improvise", "affinity for artifacts", "create a Treasure", "metalcraft"] },
  { key: "tokens", label: "Tokens", category: "S", matchers: ["create a token", "token creature", "populate"] },
  { key: "graveyard", label: "Graveyard / Reanimator", category: "S", matchers: ["return target creature card from your graveyard", "reanimate", "unearth", "persist", "undying", "dredge"] },
  { key: "spellslinger", label: "Spellslinger", category: "S", matchers: ["instant or sorcery", "prowess", "magecraft", "copy target instant", "storm"] },
  // Catégorie A
  { key: "blink", label: "Blink / Flicker", category: "A", matchers: ["exile then return", "flicker", "phase out", "enters the battlefield "] },
  { key: "tribal", label: "Tribal", category: "A", matchers: ["another target", "creatures you control get", "of the chosen type"] },
  { key: "landfall", label: "Landfall", category: "A", matchers: ["landfall", "whenever a land enters the battlefield under your control", "search your library for a land"] },
  { key: "enchantress", label: "Enchantress", category: "A", matchers: ["enchantment spell", "constellation", "aura spell", "whenever you cast an enchantment"] },
  { key: "sacrifice", label: "Sacrifice / Aristocrats", category: "A", matchers: ["sacrifice a", "whenever you sacrifice", "devour", "exploit", "whenever a creature dies"] },
  { key: "voltron", label: "Voltron", category: "A", matchers: ["equipment", "aura", "equipped creature", "enchanted creature", "commander damage"] },
  { key: "lifegain", label: "Lifegain", category: "A", matchers: ["you gain life", "lifelink", "whenever you gain life"] },
  // Catégorie B
  { key: "cascade", label: "Cascade", category: "B", matchers: ["cascade"] },
  { key: "mill", label: "Mill", category: "B", matchers: ["put the top", "cards of their library into their graveyard", "mill"] },
  { key: "group-hug", label: "Group Hug", category: "B", matchers: ["each player draws", "each player creates", "each player may"] },
  { key: "stax", label: "Stax", category: "B", matchers: ["can't cast spells", "can't attack", "enters the battlefield tapped", "stax"] },
  { key: "storm", label: "Storm", category: "B", matchers: ["storm"] },
  { key: "infect", label: "Infect", category: "B", matchers: ["infect", "proliferate"] },
  { key: "superfriends", label: "Superfriends", category: "B", matchers: ["planeswalker", "loyalty ability", "ultimate"] },
  { key: "politics", label: "Politics / Goad", category: "B", matchers: ["goad", "goaded", "monarch", "initiative"] },
];

export const RE = {
  RAMP: /(add \{|search your library for a land|treasure token)/i,
  DRAW: /(draw a card|draw two cards|whenever you draw a card)/i,
  REMOVAL: /(destroy target|exile target|counter target|fight target)/i,
  WRATHS: /(destroy all creatures|exile all creatures|all creatures get)/i,
};

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const ciMask = (s) => s.split("").filter(Boolean).sort().join("");
export const identityToQuery = (ci) => `ci<=${(ci || "").toLowerCase()}`;
export const nameOf = (c) => c?.name?.trim?.() || "";
export const oracle = (c) => (c?.oracle_text || "").toLowerCase();
export const isCommanderLegal = (c) => c?.legalities?.commander === "legal";
export const getCI = (c) => ciMask((c?.color_identity || []).join(""));
export const unionCI = (a, b) => ciMask(Array.from(new Set([...(a || "").split(""), ...(b || "").split("")])).join(""));
export const priceEUR = (c) => { const e = Number(c?.prices?.eur); const f = Number(c?.prices?.eur_foil); return isNaN(e) ? (isNaN(f) ? 0 : f) : e; };
export const edhrecScore = (c) => { const r = Number(c?.edhrec_rank) || 0; const cap = 100000; return r ? Math.max(0, 1 - Math.min(r, cap) / cap) : 0; };
const distinctBy = (keyFn) => (arr) => { const s = new Set(); return arr.filter(x => { const k = keyFn(x); if (s.has(k)) return false; s.add(k); return true; }); };
export const distinctByOracle = distinctBy((c) => c?.oracle_id || c?.id || nameOf(c));
export const distinctByName = distinctBy((c) => nameOf(c));


/***************** Helpers pour les cartes *****************/
export function bundleCard(c) {
  const f = c.card_faces || [];
  const face = (i) => f[i]?.image_uris?.normal || f[i]?.image_uris?.large || f[i]?.image_uris?.small || "";
  return {
    name: nameOf(c),
    type_line: c.type_line || f[0]?.type_line || "",
    image: c.image_uris?.normal || c.image_uris?.large || face(0) || face(1) || "",
    small: c.image_uris?.small || f[0]?.image_uris?.small || f[1]?.image_uris?.small || "",
    oracle_en: c.oracle_text || f.map(x => x.oracle_text).filter(Boolean).join('\n'),
    mana_cost: c.mana_cost || f.map(x => x.mana_cost).filter(Boolean).join(' / '),
    cmc: typeof c.cmc === 'number' ? c.cmc : (Number(c.cmc) || 0),
    prices: c.prices || {},
    scryfall_uri: c.scryfall_uri || c.related_uris?.gatherer || '',
    edhrec_rank: c.edhrec_rank || null,
  };
}

export async function bundleByName(name) {
  const c = await sf.namedExact(name);
  return bundleCard(c);
}

export const primaryTypeLabel = (tl) => {
  const t = (tl || "").toLowerCase();
  if (t.includes("creature")) return "Créatures";
  if (t.includes("artifact")) return "Artefacts";
  if (t.includes("enchantment")) return "Enchantements";
  if (t.includes("instant")) return "Éphémères";
  if (t.includes("sorcery")) return "Rituels";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("battle")) return "Batailles";
  if (t.includes("land")) return "Terrains";
  return "Autres";
};

/***************** Résolution de nom FR/EN *****************/
export async function resolveCommanderByAnyName(name) {
  try { const en = await sf.namedExact(name); if (isCommanderLegal(en)) return en; } catch { }
  const term = `legal:commander name:\"${name}\" (type:legendary or o:\"can be your commander\")`;
  const fr = await sf.search(`${term} lang:fr unique:prints order:released`).catch(() => null);
  const any = fr?.data?.[0];
  if (any) {
    const oid = any.oracle_id;
    const enOfSame = await sf.search(`oracleid:${oid} lang:en order:released unique:prints`).catch(() => null);
    const best = enOfSame?.data?.[0] || any;
    if (isCommanderLegal(best)) return best;
  }
  const gen = await sf.search(`legal:commander name:${name} (type:legendary or o:\"can be your commander\") order:edhrec`).catch(() => null);
  const pick = gen?.data?.find(isCommanderLegal) || gen?.data?.[0];
  if (pick) return pick;
  throw new Error(`Impossible de résoudre le nom: ${name}`);
}

/***************** Parser d'import de collection *****************/
export async function parseCollectionFile(file) {
  const text = await file.text(); const ext = file.name.split('.').pop().toLowerCase(); const rows = [];
  if (ext === "json") { try { const data = JSON.parse(text); if (Array.isArray(data)) for (const it of data) { if (it?.name) rows.push({ name: String(it.name).trim(), qty: Number(it.quantity || it.qty || 1) || 1 }); } } catch { } }
  else if (["csv", "tsv", "tab"].includes(ext)) {
    const lines = text.split(/\r?\n/).filter(Boolean); const [h0, ...rest] = lines; const headers = h0.toLowerCase().split(/,|\t|;/).map(s => s.trim()); const hasHeader = headers.includes('name'); const dataLines = hasHeader ? rest : lines;
    for (const line of dataLines) { const cols = line.split(/,|\t|;/).map(s => s.trim()); let name = "", qty = 1; if (hasHeader) { const obj = Object.fromEntries(cols.map((v, i) => [headers[i] || `c${i}`, v])); name = obj.name || obj.card || ""; qty = Number(obj.count || obj.qty || obj.quantity || 1) || 1; } else { const [a, b] = cols; if (/^\d+$/.test(a)) { qty = Number(a); name = b; } else if (/^\d+$/.test(b)) { qty = Number(b); name = a; } else { name = line.trim(); qty = 1; } } if (name) rows.push({ name, qty }); }
  }
  else {
    for (const line of text.split(/\r?\n/)) { const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/); if (m) rows.push({ name: m[2].trim(), qty: Number(m[1]) }); else if (line.trim()) rows.push({ name: line.trim(), qty: 1 }); }
  }
  const map = new Map(); for (const { name, qty } of rows) { const k = name.toLowerCase(); map.set(k, (map.get(k) || 0) + qty); }
  return map;
}

/***************** Autocomplete Search *****************/
export async function searchCommandersAnyLang(q) {
    const base = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) name:${q}`;
    const [en, fr] = await Promise.all([
        sf.search(`${base} unique:prints order:edhrec`),
        sf.search(`${base} lang:fr unique:prints order:edhrec`)
    ]);
    const pool = distinctByOracle([...(en.data || []), ...(fr.data || [])]).slice(0, 20);
    return pool.map(card => ({
        id: card.id, oracle_id: card.oracle_id,
        display: card.printed_name || card.name, canonical: card.name, type_line: card.type_line,
        image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.card_faces?.[1]?.image_uris?.small || "",
        raw: card,
    }));
}

export async function fetchCommanderDeckCount(cardName) {
  if (!cardName) return null;
  const slug = cardName.toLowerCase().split('//')[0].trim().replace(/,+/g, '').replace(/\s+/g, '-');
  try {
    const response = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`);
    if (!response.ok) return null;
    const json = await response.json();
    return json?.container?.json_dict?.card?.num_decks || null;
  } catch (error) {
    console.error("Erreur lors de la récupération des données EDHREC:", error);
    return null;
  }
}
