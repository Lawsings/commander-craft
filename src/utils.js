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
  { key: "blink", label: "Blink / Flicker", matchers: ["exile then return", "flicker", "phase out", "enters the battlefield ", "blink"] },
  { key: "tokens", label: "Tokens", matchers: ["create a token", "token"] },
  { key: "sacrifice", label: "Sacrifice", matchers: ["sacrifice a", "whenever you sacrifice", "devour", "exploit"] },
  { key: "lifegain", label: "Gain de vie", matchers: ["you gain", "lifelink", "whenever you gain life"] },
  { key: "spellslinger", label: "Spellslinger", matchers: ["instant or sorcery", "prowess", "magecraft", "copy target instant", "storm"] },
  { key: "+1+1", label: "+1/+1 Counters", matchers: ["+1/+1 counter", "proliferate", "evolve"] },
  { key: "reanimator", label: "Réanimation", matchers: ["return target creature card from your graveyard", "reanimate", "unearth", "persist", "undying"] },
  { key: "landfall", label: "Landfall / Terrains", matchers: ["landfall", "whenever a land enters the battlefield under your control", "search your library for a land"] },
  { key: "artifacts", label: "Artifacts", matchers: ["artifact you control", "improvise", "affinity for artifacts", "create a Treasure"] },
  { key: "enchantress", label: "Enchantements", matchers: ["enchantment spell", "constellation", "aura", "enchantress"] },
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

/**
 * Récupère le nombre de decks pour un commandant donné depuis les données JSON d'EDHREC.
 * C'est une source de données non officielle, mais couramment utilisée.
 * @param {string} cardName - Le nom anglais exact de la carte.
 * @returns {Promise<number|null>} Le nombre de decks, ou null en cas d'erreur.
 */
export async function fetchCommanderDeckCount(cardName) {
  if (!cardName) return null;

  // Crée un "slug" à partir du nom de la carte (ex: "Etali, Primal Storm" -> "etali-primal-storm")
  const slug = cardName
    .toLowerCase()
    .split('//')[0] // Garde seulement la première face pour les cartes doubles
    .trim()
    .replace(/,+/g, '') // Enlève les virgules
    .replace(/\s+/g, '-'); // Remplace les espaces par des tirets

  try {
    // Utilise un proxy CORS pour éviter les blocages en déploiement
    const response = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`);
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    // Navigue dans l'objet JSON pour trouver le nombre de decks
    return json?.container?.json_dict?.card?.num_decks || null;
  } catch (error) {
    console.error("Erreur lors de la récupération des données EDHREC:", error);
    return null;
  }
}
