// Fichier: netlify/functions/generate-deck.js
// Objectif : garder le même endpoint et le même shape de réponse que l'ancienne version Gemini
// Réponse: { commanders: string[], spells: string[], lands: string[] }

import OpenAI from "openai";

// Utilitaires locaux pour la manabase (simples et robustes)
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
  // On récupère des terrains non-basiques "commander-legal", triés EDHrec
  // via Scryfall. Node 20 => fetch global OK.
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
  if (!r.ok) {
    throw new Error(`Scryfall lands ${r.status}`);
  }
  const json = await r.json();
  const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
  return names.slice(0, count);
}

function buildBasicLands({ colorIdentity, basicCount }) {
  const map = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
  const colors = ciToArray(colorIdentity);
  const basics = [];

  if (colors.length === 0) {
    // Incolore
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
  // Heuristiques EDH classiques (ta note EDHrec-like) :
  // mono 36–37 ; bi 37 ; tri 38–39 ; 4–5c 39–40
  const ci = ciToArray(colorIdentity);
  const colors = ci.length;

  let lands = Number.isFinite(targetLands) ? targetLands : 37;
  lands = clamp(lands, 34, 42); // garde une marge safe (l'utilisateur peut bouger ce slider)

  // Ratio non-basiques :  mono ~25–35%, bi/tri ~60–80%, 4–5c ~75–85%
  let nonBasic = Math.round(
    lands *
      (colors <= 1 ? 0.30 : colors === 2 ? 0.65 : colors === 3 ? 0.75 : 0.80)
  );

  // bornes raisonnables
  if (colors <= 1) nonBasic = clamp(nonBasic, 6, lands - 10);
  else if (colors === 2) nonBasic = clamp(nonBasic, 16, lands - 10);
  else if (colors >= 3) nonBasic = clamp(nonBasic, 22, lands - 8);

  const basic = Math.max(0, lands - nonBasic);
  return { lands, nonBasic, basic };
}

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
    budget = 0,          // number (euros)
    mechanics = [],      // string[]
    ownedCards = [],     // string[]
    targetLands          // number (souhait utilisateur)
  } = payload;

  if (!commander || typeof commander !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Paramètre 'commander' requis." }) };
  }

  // Calcul des objectifs
  const { lands, nonBasic, basic } = pickLandTargets(targetLands, colorIdentity);
  const nonLandSlots = 99 - lands; // nombre de non-terrains à générer

  // Prépare la contrainte JSON stricte pour la sortie LLM
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

  // Prompt : strict, sans blabla, pour renvoyer UNIQUEMENT les sorts (non-terrains)
  const userContext = {
    commander,
    colorIdentity,
    budget,
    mechanics,
    ownedCards,
    targets: {
      lands, // à titre informatif; on demande uniquement les non-lands au LLM
      nonLandSlots,
      // Rappels EDH : ratios et rôles indicatifs
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
      "- Adapter environ aux ratios EDH classiques (purement indicatif) à l'intérieur des non-terrains.",
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
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "SpellsOnly",
          schema: spellsSchema,
          strict: true
        }
      },
      max_output_tokens: 1200,
      temperature: 0.8
    });

    // Extraction du JSON
    // (Compat: certaines versions exposent output_text; on gère les deux cas)
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

  // Sécurité minimale côté serveur (unicité + trimming)
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
    // Si pour une raison X, le LLM n'a pas rendu le bon compte, on sort une erreur claire
    return {
      statusCode: 502,
      body: JSON.stringify({ error: `Le LLM n'a pas renvoyé ${nonLandSlots} non-terrains (reçu: ${cleanSpells.length}).` })
    };
  }

  // ---- Construction de la manabase (non-basiques + basiques) ----
  try {
    const nonBasicNames = await fetchNonBasicLands({ colorIdentity, count: nonBasic });
    const basicNames = buildBasicLands({ colorIdentity, basicCount: basic });
    const landsArray = [...nonBasicNames, ...basicNames];

    // Réponse finale (shape identique à l’ancienne version Gemini)
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
