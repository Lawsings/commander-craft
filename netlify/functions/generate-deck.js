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
  const DEBUG = process.env.DEBUG_FUNCTION === "1";
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const USE_MOCK = process.env.USE_MOCK === "1";

    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Corps JSON invalide." }) };
    }

    const {
      commander,
      colorIdentity,
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

    // --- Mode MOCK : pour tester sans OpenAI ---
    if (USE_MOCK) {
      const fakeSpells = [];
      for (let i = 1; i <= nonLandSlots; i++) fakeSpells.push(`Mock Spell ${i}`);
      const nonBasicNames = ["Command Tower","Exotic Orchard","Path of Ancestry"].slice(0, nonBasic);
      while (nonBasicNames.length < nonBasic) nonBasicNames.push("Temple of the False God");
      const basicNames = buildBasicLands({ colorIdentity, basicCount: basic });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commanders: [commander], spells: fakeSpells, lands: [...nonBasicNames, ...basicNames] })
      };
    }

    if (!OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY manquant côté serveur." }) };
    }

    // Schéma JSON (sans uniqueItems — non supporté par Structured Outputs)
    const spellsSchema = {
      type: "object",
      properties: {
        spells: {
          type: "array",
          items: { type: "string" },
          minItems: nonLandSlots,
          maxItems: nonLandSlots
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
      "- Identité couleur respectée.",
      "- Format Commander: singleton, légal Commander, pas de bannies.",
      "- Favoriser ownedCards si pertinent.",
      "- Prendre en compte mechanics/thèmes.",
      "- Ratios EDH indicatifs dans les non-terrains.",
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

    // ---- Appel OpenAI Responses API (text.format avec schema, sans uniqueItems) ----
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    let resp;
    try {
      resp = await client.responses.create({
        model: MODEL,
        input: `${systemPrompt}\n\n${userPrompt}`,
        text: {
          format: {
            type: "json_schema",
            name: "SpellsOnly",
            schema: spellsSchema,
            strict: true
          }
        },
        max_output_tokens: 1200,
        temperature: 0.8
      });
    } catch (e) {
      const status = e?.status || 502;
      const details = e?.error || e?.response || e?.message || String(e);
      if (DEBUG) {
        return { statusCode: status, body: JSON.stringify({ error: "OPENAI_REQUEST_FAILED", details }) };
      }
      return { statusCode: status, body: JSON.stringify({ error: "OPENAI_REQUEST_FAILED" }) };
    }

    const jsonText =
      resp?.output_text ??
      resp?.output?.[0]?.content?.[0]?.text ??
      "";

    if (!jsonText) {
      const msg = "Réponse OpenAI vide (jsonText manquant).";
      return { statusCode: 502, body: JSON.stringify({ error: "EMPTY_OPENAI_RESPONSE", message: msg }) };
    }

    let spells;
    try {
      const parsed = JSON.parse(jsonText);
      spells = Array.isArray(parsed.spells) ? parsed.spells : [];
    } catch (e) {
      const snippet = jsonText.slice(0, 400);
      return { statusCode: 502, body: JSON.stringify({ error: "INVALID_OPENAI_JSON", snippet }) };
    }

    // Dédup + trim + contrôle du compte
    const set = new Set();
    const cleanSpells = [];
    for (const n of spells) {
      const name = String(n || "").split("//")[0].trim();
      if (name && !set.has(name)) { set.add(name); cleanSpells.push(name); }
    }
    if (cleanSpells.length !== nonLandSlots) {
      return { statusCode: 502, body: JSON.stringify({
        error: "WRONG_COUNT",
        expected: nonLandSlots,
        got: cleanSpells.length
      }) };
    }

    // Lands
    let landsArray = [];
    try {
      const nonBasicNames = await fetchNonBasicLands({ colorIdentity, count: nonBasic });
      const basicNames = buildBasicLands({ colorIdentity, basicCount: basic });
      landsArray = [...nonBasicNames, ...basicNames];
    } catch (e) {
      const msg = e?.message || String(e);
      if (DEBUG) {
        return { statusCode: 502, body: JSON.stringify({ error: "LANDS_BUILD_FAILED", message: msg }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: "LANDS_BUILD_FAILED" }) };
    }

    const finalDeck = { commanders: [commander], spells: cleanSpells, lands: landsArray };
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(finalDeck) };

  } catch (err) {
    const message = err?.message || String(err);
    const payload = { error: "INTERNAL_ERROR", message };
    if (process.env.DEBUG_FUNCTION === "1") payload.stack = err?.stack || null;
    return { statusCode: 500, body: JSON.stringify(payload) };
  }
};
