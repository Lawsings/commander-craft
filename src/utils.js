// Fichier: utils.js (Complet et Nettoyé)

/***************** Scryfall API *****************/
export const sf = {
  async search(q, opts = {}) {
    const params = new URLSearchParams({ q, unique: opts.unique || "cards", ...opts });
    const r = await fetch(`https://api.scryfall.com/cards/search?${params}`);
    if (!r.ok) throw new Error(`Scryfall ${r.status}`);
    return r.json();
  },
  async random(q) {
    // ⚠️ Corrigé : on passe par la Netlify Function pour éviter le CORS
    const r = await fetch(`/.netlify/functions/random-commander?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`Random proxy ${r.status}`);
    return r.json();
  },
  async namedExact(n) {
    const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`);
    if (!r.ok) throw new Error(`Nom introuvable: ${n}`);
    return r.json();
  },
};

/***************** Listes de cartes spéciales *****************/
export const WIN_CONDITIONS = new Set([
  "craterhoof behemoth", "expropriate", "torment of hailfire", "approach of the second sun",
  "aetherflux reservoir", "thassa's oracle", "finale of devastation", "insurrection",
  "revel in riches", "triskaidekaphile", "felidar sovereign", "test of endurance",
  "mayael's aria", "simic ascendancy", "vorinclex, monstrous raider", "triumph of the hordes"
]);

export const GAME_CHANGERS = new Set([
  "cyclonic rift", "damnation", "wrath of god", "blasphemous act", "toxic deluge", "farewell",
  "austere command", "vanquish the horde", "sunfall", "sol ring", "mana crypt", "mana vault",
  "jeweled lotus", "dark ritual", "jeska's will", "rhystic study", "smothering tithe",
  "mystic remora", "dockside extortionist", "esper sentinel", "demonic tutor", "vampiric tutor",
  "enlightened tutor", "worldly tutor", "mystical tutor", "fierce guardianship", "deflecting swat",
  "flawless maneuver", "deadly rollick", "force of will"
]);

/***************** Constantes et Utilitaires *****************/
export const MECHANIC_TAGS = [
  { key: "+1+1", label: "+1/+1 Counters", category: "S" },
  { key: "artifacts", label: "Artifacts Matter", category: "S" },
  { key: "tokens", label: "Tokens", category: "S" },
  { key: "graveyard", label: "Graveyard / Reanimator", category: "S" },
  { key: "spellslinger", label: "Spellslinger", category: "S" },
  { key: "blink", label: "Blink / Flicker", category: "A" },
  { key: "tribal", label: "Tribal", category: "A" },
  { key: "landfall", label: "Landfall", category: "A" },
  { key: "enchantress", label: "Enchantress", category: "A" },
  { key: "sacrifice", label: "Sacrifice / Aristocrats", category: "A" },
  { key: "voltron", label: "Voltron", category: "A" },
  { key: "lifegain", label: "Lifegain", category: "A" },
  { key: "cascade", label: "Cascade", category: "B" },
  { key: "mill", label: "Mill", category: "B" },
  { key: "group-hug", label: "Group Hug", category: "B" },
  { key: "stax", label: "Stax", category: "B" },
  { key: "storm", label: "Storm", category: "B" },
  { key: "infect", label: "Infect", category: "B" },
  { key: "superfriends", label: "Superfriends", category: "B" },
  { key: "politics", label: "Politics / Goad", category: "B" },
];

export const RE = {
  RAMP: /(add \{|search your library for a land|treasure token)/i,
  DRAW: /(draw a card|draw two cards|whenever you draw a card)/i,
  REMOVAL: /(destroy target|exile target|counter target|fight target)/i,
  WRATHS: /(destroy all creatures|exile all creatures|all creatures get)/i,
};

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const ciMask = (s) => s.split("").filter(Boolean).sort().join("");
export const identityToQuery = (ci) => (ci ? `ci<=${ci.toLowerCase()}` : "");
export const nameOf = (c) => c?.name?.trim?.() || "";
export const oracle = (c) => (c?.oracle_text || "").toLowerCase();
export const isCommanderLegal = (c) => c?.legalities?.commander === "legal";
export const getCI = (c) => ciMask((c?.color_identity || []).join(""));
export const unionCI = (a, b) => ciMask(Array.from(new Set([...(a || "").split(""), ...(b || "").split("")])).join(""));
export const priceEUR = (c) => Number(c?.prices?.eur) || Number(c?.prices?.eur_foil) || 0;

/***************** Helpers pour les cartes *****************/
export function bundleCard(c) {
  const f = c.card_faces || [];
  const face = (i, type) => f[i]?.image_uris?.[type] || "";
  return {
    name: nameOf(c),
    type_line: c.type_line || f[0]?.type_line || "",
    image: c.image_uris?.normal || face(0, 'normal') || face(1, 'normal') || "",
    small: c.image_uris?.small || face(0, 'small') || face(1, 'small') || "",
    oracle_en: c.oracle_text || f.map(x => x.oracle_text).filter(Boolean).join('\n'),
    mana_cost: c.mana_cost || f.map(x => x.mana_cost).filter(Boolean).join(' / '),
    cmc: c.cmc ?? 0,
    prices: c.prices || {},
    scryfall_uri: c.scryfall_uri || '',
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
  const term = `legal:commander name:"${name}" (type:legendary or o:"can be your commander")`;
  const fr = await sf.search(`${term} lang:fr unique:prints order:released`).catch(() => null);
  if (fr?.data?.[0]) {
    const enOfSame = await sf.search(`oracleid:${fr.data[0].oracle_id} lang:en order:released unique:prints`).catch(() => null);
    const best = enOfSame?.data?.[0] || fr.data[0];
    if (isCommanderLegal(best)) return best;
  }
  const gen = await sf.search(`legal:commander name:${name} (type:legendary or o:"can be your commander") order:edhrec`).catch(() => null);
  const pick = gen?.data?.find(isCommanderLegal);
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
    const base = `legal:commander (type:"legendary creature" or (type:planeswalker and o:"can be your commander") or type:background) name:${q}`;
    const [en, fr] = await Promise.all([
        sf.search(`${base} unique:prints order:edhrec`),
        sf.search(`${base} lang:fr unique:prints order:edhrec`)
    ]);
    // On utilise un Map pour dédoublonner par oracle_id pour être plus robuste
    const distinctPool = new Map();
    [...(en.data || []), ...(fr.data || [])].forEach(card => {
        if (!distinctPool.has(card.oracle_id)) {
            distinctPool.set(card.oracle_id, card);
        }
    });
    const pool = Array.from(distinctPool.values()).slice(0, 20);

    return pool.map(card => ({
        id: card.id, oracle_id: card.oracle_id,
        display: card.printed_name || card.name, canonical: card.name, type_line: card.type_line,
        image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || "",
        raw: card,
    }));
}

/***************** EDHREC Util *****************/
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
