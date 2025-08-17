// Fichier: netlify/functions/generate-deck.js
// Objectif : garder le même endpoint et le même shape de réponse que l'ancienne version Gemini
// Réponse: { commanders: string[], spells: string[], lands: string[] }

import OpenAI from "openai";

// --- Utils ---
function ciToArray(ciString = "") {
  return (ciString || "")
    .split("")
    .map((c) => c.toUpperCase())
    .filter((c) => ["W", "U", "B", "R", "G"].includes(c));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function fetchNonBasicLands({ colorIdentity, count }) {
  // Scryfall: terrains non-basiques, légaux Commander, triés par popularité EDHrec
  const ci = (colorIdentity || "").toLowerCase();
  const q = [
    "t:land",
    "-is:basic",
    "legal:commander",
    "game:paper",
    ci ? `ci<=${ci}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  const url =
    "https://api.scryfall.com/cards/search?q=" +
    encodeURIComponent(q) +
    "&unique=cards&order=edhrec";

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Scryfall lands ${r.status}`);
  const json = await r.json();
  const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
  return names.slice(0, count);
}

function buildBasicLands({ colorIdentity, basicCount }) {
  const map = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
  const colors = ciToArray(colorIdentity);
  const basics = [];

  if (colors.length === 0) {
    for (let i = 0; i < basicCount; i++) basics.push("Wastes");
    return basics;
  }

  const perColor = Math.floor(basicCount / colors.length);
  let remainder = basicCount % colors.length;

  for (const c of colors) {
    for (let i = 0; i < perColor; i++) basics.push(map[c]);
    if (remainder > 0) {
      basics.push(map[c]);
      remainder--;
    }
  }
  return basics;
}

function pickLandTargets(targetLands, colorIdentity) {
  const ci = ciToArray(colorIdentity);
  const colors = ci.length;

  let lands = Number.isFinite(targetLands) ? targetLands : 37;
  lands = clamp(lands, 34, 42);

  // Ratio non-basiques : mono ~30%, bi ~65%, tri ~75%, 4–5c ~80%
  let nonBasic = Math.round(
    lands * (colors <= 1 ? 0.30 : colors === 2 ? 0.65 : colors === 3 ? 0.75 : 0.80)
  );

  if (colors <= 1) nonBasic = clamp(nonBasic, 6, lands - 10);
  else if (colors === 2) nonBasic = clamp(nonBasic, 16, lands - 10);
  else if (colors >= 3) nonBasic = clamp(nonBasic, 22, lands - 8);

  const basic = Math.max(0, lands - nonBasic);
  return { lands, nonBasic, basic };
}

// --- Handler ---
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "OPENAI_API_KEY manquant côté serveur." }),
    };
  }

  const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Corps JSON invalide." }) };
  }

  const {
    commander,           // string
    colorIdentity,       // string ex: "WU"
    budget = 0,          // number
    mechanics = [],      // string[]
    ownedCards = [],     // string[]
    targetLands          // number (souhait utilisateur)
  } = payload;

  if (!commander || typeof commander !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Paramètre 'commander' requis." }) };
  }

  const { lands, nonBasic, basic } = pickLandTargets(targetLands, colorIdentity);
  const nonLandSlots = 99 - lands;

  const spellsSchema = {
    type: "object",
    properties: {
      spells: {
        type: "array",
        items: { type: "string" },
        minItems: nonLandSlots,
        maxItems: nonLandSlots,
        uniqueItems: true
      }
    },
    required: ["spells"],
    additionalProperties: false
  };

  const userContext = {
    commander,
    colorIdentity,
    budget,
    mechanics,
    ownedCards,
    targets: {
      lands,
      nonLandSlots,
      roles: { ramp: [8, 12], draw: [8, 12], spotRemoval: [6, 10], boardWipes: [2, 4] },
      mix: {
        creatures: [25, 35],
        instantsPlusSorceries: [10, 20],
        artifactsPlusEnchantments: [10, 15],
        planeswalkers: [0, 5]
      }
    }
  };

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  // ---- Appel LLM (non-terrains uniquement) ----
  let spells = [];
  try {
    const systemPrompt = [
      "Tu es un générateur de decks MTG Commander.",
      "Renvoie UNIQUEMENT un JSON valide conforme au schéma demandé.",
      "Contraintes obligatoires :",
      "- Respecter l'identité couleur du commandant (aucune carte hors identité).",
      "- Format Commander: singleton (1 exemplaire), cartes 'commander-legal', pas de cartes bannies.",
      "- Favoriser les cartes possédées par l'utilisateur si pertinentes.",
      "- Prendre en compte les mécaniques/thèmes fournis.",
      "- Adapter environ aux ratios EDH classiques (indicatifs) dans les non-terrains.",
      "Ne renvoie aucun texte d'explication humain hors JSON."
    ].join("\n");

    const userPrompt =
`Contexte utilisateur (JSON):
${JSON.stringify(userContext, null, 2)}

Tâche:
- Génère une liste de ${nonLandSlots} NOMS DE CARTES **non-terrains** (string exacts),
- Toutes légales en Commander et compatibles avec l'identité ${colorIdentity || "(inconnue)"},
- Singleton (pas de doublons),
- Si possible, inclure quelques cartes présentes dans 'ownedCards', lorsque pertinentes.

FORMAT DE SORTIE STRICT:
{
  "spells": [ /* exactement ${nonLandSlots} noms */ ]
}`;

    const resp = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      // ✅ Nouveau format (Responses API)
      text: {
        format: "json_schema",
        json_schema: {
          name: "SpellsOnly",
          schema: spellsSchema,
          strict: true
        }
      },
      max_output_tokens: 1200,
      temperature: 0.8
    });

    // Extraction du JSON (compat output/output_text)
    let jsonText =
      resp?.output?.[0]?.content?.[0]?.text ??
      resp?.output_text ??
      "";

    const parsed = JSON.parse(jsonText);
    spells = Array.isArray(parsed.spells) ? parsed.spells : [];
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `OpenAI error: ${e.message}` })
    };
  }

  // Dédupe + nettoyage simple
  const set = new Set();
  const cleanSpells = [];
  for (const n of spells) {
    const name = String(n || "").split("//")[0].trim();
    if (name && !set.has(name)) {
      set.add(name);
      cleanSpells.push(name);
    }
  }

  if (cleanSpells.length !== nonLandSlots) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: `Le LLM n'a pas renvoyé ${nonLandSlots} non-terrains (reçu: ${cleanSpells.length}).` })
    };
  }

  // ---- Construction de la manabase ----
  try {
    const nonBasicNames = await fetchNonBasicLands({ colorIdentity, count: nonBasic });
    const basicNames = buildBasicLands({ colorIdentity, basicCount: basic });
    const landsArray = [...nonBasicNames, ...basicNames];

    const finalDeck = {
      commanders: [commander],
      spells: cleanSpells,
      lands: landsArray
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalDeck)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
