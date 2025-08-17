// netlify/functions/generate-deck.js
import OpenAI from "openai";

// ---------- Utils ----------
function ciToArray(ciString = "") {
  return (ciString || "")
    .split("")
    .map((c) => c.toUpperCase())
    .filter((c) => ["W", "U", "B", "R", "G"].includes(c));
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

async function fetchNonBasicLands({ colorIdentity, count }) {
  const ci = (colorIdentity || "").toLowerCase();
  const q = [
    "t:land", "-is:basic", "legal:commander", "game:paper",
    ci ? `ci<=${ci}` : ""
  ].filter(Boolean).join(" ");

  const url = "https://api.scryfall.com/cards/search?q=" +
              encodeURIComponent(q) +
              "&unique=cards&order=edhrec";

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Scryfall lands HTTP ${r.status}`);
  const json = await r.json();
  const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
  return names.slice(0, count);
}

function buildBasicLands({ colorIdentity, basicCount }) {
  const map = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
  const colors = ciToArray(colorIdentity);
  const basics = [];
  if (colors.length === 0) { for (let i=0;i<basicCount;i++) basics.push("Wastes"); return basics; }
  const perColor = Math.floor(basicCount / colors.length);
  let rem = basicCount % colors.length;
  for (const c of colors) {
    for (let i=0;i<perColor;i++) basics.push(map[c]);
    if (rem > 0) { basics.push(map[c]); rem--; }
  }
  return basics;
}

function pickLandTargets(targetLands, colorIdentity) {
  const colors = ciToArray(colorIdentity).length;
  let lands = Number.isFinite(targetLands) ? targetLands : 37;
  lands = clamp(lands, 34, 42);
  let nonBasic = Math.round(lands * (colors <= 1 ? 0.30 : colors === 2 ? 0.65 : colors === 3 ? 0.75 : 0.80));
  if (colors <= 1) nonBasic = clamp(nonBasic, 6, lands - 10);
  else if (colors === 2) nonBasic = clamp(nonBasic, 16, lands - 10);
  else if (colors >= 3) nonBasic = clamp(nonBasic, 22, lands - 8);
  const basic = Math.max(0, lands - nonBasic);
  return { lands, nonBasic, basic };
}

// ---------- Handler ----------
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "OPENAI_API_KEY manquant côté serveur." }) };
    }

    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: "Corps JSON invalide." }) }; }

    const {
      commander,           // string
      colorIdentity,       // ex: "WU"
      budget = 0,
      mechanics = [],
      ownedCards = [],
      targetLands
    } = payload;

    if (!commander || typeof commander !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "Paramètre 'commander' requis." }) };
    }

    const { lands, nonBasic, basic } = pickLandTargets(targetLands, colorIdentity);
    const nonLandSlots = 99 - lands;

    // Schéma pour sortie structurée (spells uniquement)
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
        roles: { ramp: [8,12], draw: [8,12], spotRemoval: [6,10], boardWipes: [2,4] },
        mix: {
          creatures: [25,35],
          instantsPlusSorceries: [10,20],
          artifactsPlusEnchantments: [10,15],
          planeswalkers: [0,5]
        }
      }
    };

    const systemPrompt = [
      "Tu es un générateur de decks MTG Commander.",
      "Renvoie UNIQUEMENT un JSON valide conforme au schéma demandé.",
      "Contraintes obligatoires :",
      "- Respect identité couleur du commandant (aucune carte hors identité).",
      "- Format Commander: singleton, légal Commander, pas de cartes bannies.",
      "- Favoriser les cartes possédées si pertinentes.",
      "- Prendre en compte mécaniques/thèmes fournis.",
      "- Adapter environ aux ratios EDH (indicatifs) dans les non-terrains.",
      "Ne renvoie aucun texte d'explication humain hors JSON."
    ].join("\n");

    const userPrompt =
`Contexte utilisateur (JSON):
${JSON.stringify(userContext, null, 2)}

Tâche:
- Génère une liste de ${nonLandSlots} NOMS DE CARTES **non-terrains** (string exacts),
- Légales en Commander et compatibles avec l'identité ${colorIdentity || "(inconnue)"},
- Singleton (pas de doublons),
- Inclure si possible des cartes présentes dans 'ownedCards' si pertinentes.

FORMAT DE SORTIE STRICT:
{
  "spells": [ /* exactement ${nonLandSlots} noms */ ]
}`;

    // ---- Appel OpenAI Responses API (version simplifiée & à jour) ----
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const resp = await client.responses.create({
      model: MODEL,
      // IMPORTANT : on passe un unique input string, c'est le chemin le plus robuste
      input: `${systemPrompt}\n\n${userPrompt}`,
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

    // Récupération sûre du JSON (output_text est fourni par le SDK v4+)
    const jsonText =
      resp?.output_text ??
      resp?.output?.[0]?.content?.[0]?.text ??
      "";

    if (!jsonText) {
      return { statusCode: 502, body: JSON.stringify({ error: "Réponse OpenAI vide (jsonText manquant)." }) };
    }

    let spells;
    try {
      const parsed = JSON.parse(jsonText);
      spells = Array.isArray(parsed.spells) ? parsed.spells : [];
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "JSON invalide renvoyé par le LLM.", details: jsonText.slice(0, 400) }) };
    }

    // Dédup + trim
    const set = new Set();
    const cleanSpells = [];
    for (const n of spells) {
      const name = String(n || "").split("//")[0].trim();
      if (name && !set.has(name)) { set.add(name); cleanSpells.push(name); }
    }
    if (cleanSpells.length !== nonLandSlots) {
      return { statusCode: 502, body: JSON.stringify({ error: `Le LLM n'a pas renvoyé ${nonLandSlots} non-terrains (reçu: ${cleanSpells.length}).` }) };
    }

    // Lands
    const nonBasicNames = await fetchNonBasicLands({ colorIdentity, count: nonBasic });
    const basicNames = buildBasicLands({ colorIdentity, basicCount: basic });
    const landsArray = [...nonBasicNames, ...basicNames];

    const finalDeck = { commanders: [commander], spells: cleanSpells, lands: landsArray };
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(finalDeck) };

  } catch (err) {
    // Log côté function + message lisible côté front
    console.error("generate-deck error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Erreur interne",
        message: err?.message || String(err),
        // aide au debug : commente la ligne suivante en prod si tu veux moins de verbosité
        stack: err?.stack || null
      })
    };
  }
};
