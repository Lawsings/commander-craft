// netlify/functions/generate-deck.js
import OpenAI from "openai";

// CORS headers
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Utils
function ciToArray(ciString = "") {
  return (ciString || "")
    .split("")
    .map((c) => c.toUpperCase())
    .filter((c) => ["W", "U", "B", "R", "G"].includes(c));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Structure optimisée pour Commander
const COMMANDER_STRUCTURE = {
  totalCards: 99,
  lands: {
    min: 35,
    max: 38,
    target: 36
  },
  spells: {
    creatures: { min: 20, max: 30, target: 25 },
    ramp: { min: 8, max: 12, target: 10 },
    removal: { min: 5, max: 8, target: 6 },
    draw: { min: 6, max: 10, target: 8 },
    wincons: { min: 2, max: 5, target: 3 },
    utility: { min: 10, max: 20, target: 15 }
  }
};

async function fetchNonBasicLands({ colorIdentity, count }) {
  const ci = (colorIdentity || "").toLowerCase();
  const q = [
    "t:land", "-is:basic", "legal:commander", "game:paper",
    ci ? `ci<=${ci}` : ""
  ].filter(Boolean).join(" ");

  const url = "https://api.scryfall.com/cards/search?q=" +
    encodeURIComponent(q) +
    "&unique=cards&order=edhrec";

  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.log(`Scryfall lands API returned ${r.status}`);
      return getDefaultNonBasicLands(colorIdentity, count);
    }
    const json = await r.json();
    const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
    return names.slice(0, count);
  } catch (error) {
    console.error("Erreur fetch terrains:", error);
    return getDefaultNonBasicLands(colorIdentity, count);
  }
}

function getDefaultNonBasicLands(colorIdentity, count) {
  const colors = ciToArray(colorIdentity);
  const defaults = [
    "Command Tower", "Path of Ancestry", "Exotic Orchard",
    "Reflecting Pool", "City of Brass", "Mana Confluence",
    "Unclaimed Territory", "Ancient Ziggurat", "Cavern of Souls",
    "Reliquary Tower", "Rogue's Passage", "Temple of the False God"
  ];

  // Ajouter des terrains spécifiques selon les couleurs
  if (colors.length === 2) {
    defaults.unshift("Arcane Signet", "Sol Ring");
  }

  return defaults.slice(0, count);
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
  let rem = basicCount % colors.length;

  for (const c of colors) {
    for (let i = 0; i < perColor; i++) basics.push(map[c]);
    if (rem > 0) {
      basics.push(map[c]);
      rem--;
    }
  }
  return basics;
}

function pickLandTargets(targetLands, colorIdentity) {
  const colors = ciToArray(colorIdentity).length;
  let lands = Number.isFinite(targetLands) ? targetLands : COMMANDER_STRUCTURE.lands.target;
  lands = clamp(lands, COMMANDER_STRUCTURE.lands.min, COMMANDER_STRUCTURE.lands.max);

  // Calculer la répartition basic/non-basic selon le nombre de couleurs
  let nonBasic = Math.round(lands * (colors <= 1 ? 0.30 : colors === 2 ? 0.65 : colors === 3 ? 0.75 : 0.80));

  if (colors <= 1) nonBasic = clamp(nonBasic, 6, lands - 10);
  else if (colors === 2) nonBasic = clamp(nonBasic, 16, lands - 10);
  else if (colors >= 3) nonBasic = clamp(nonBasic, 22, lands - 8);

  const basic = Math.max(8, lands - nonBasic);

  return { lands, nonBasic, basic };
}

// Prompt simplifié et plus robuste pour OpenAI
function buildDeckPrompt({ commander, colorIdentity, budget, mechanics, lands, nonBasic, basic }) {
  const colors = ciToArray(colorIdentity);
  const budgetText = budget > 100 ? "élevé" : budget > 50 ? "moyen" : "faible";
  const mechanicsText = mechanics.length > 0 ? mechanics.join(", ") : "synergie générale";

  return `Tu es un expert en Magic: The Gathering spécialisé en format Commander.

MISSION: Créer une liste de deck Commander de EXACTEMENT ${COMMANDER_STRUCTURE.totalCards} cartes.

COMMANDANT: ${commander}
IDENTITÉ COULEUR: ${colors.join("") || "Incolore"}
BUDGET: ${budgetText}
MÉCANIQUES: ${mechanicsText}

STRUCTURE REQUISE:
- ${COMMANDER_STRUCTURE.spells.creatures.target} créatures
- ${COMMANDER_STRUCTURE.spells.ramp.target} sorts de ramp/accélération de mana
- ${COMMANDER_STRUCTURE.spells.removal.target} sorts de removal/destruction
- ${COMMANDER_STRUCTURE.spells.draw.target} sorts de pioche/card draw
- ${COMMANDER_STRUCTURE.spells.wincons.target} conditions de victoire
- ${COMMANDER_STRUCTURE.spells.utility.target} autres sorts utilitaires
- ${lands} terrains (${basic} basics + ${nonBasic} non-basics)

RÈGLES STRICTES:
1. TOTAL = ${COMMANDER_STRUCTURE.totalCards} cartes exactement
2. Respecter l'identité couleur: ${colors.join("") || "Incolore"}
3. Aucun doublon (sauf terrains de base)
4. Noms de cartes en ANGLAIS uniquement
5. Cartes légales en Commander

RÉPONSE JSON OBLIGATOIRE:
{
  "commanders": ["${commander}"],
  "spells": [liste de ${COMMANDER_STRUCTURE.totalCards - lands} noms de sorts],
  "lands": [liste de ${lands} noms de terrains]
}

Fournis UNIQUEMENT le JSON, rien d'autre.`;
}

// Validation simplifiée
function validateDeck(deckData) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    cardCount: 0
  };

  try {
    if (!deckData || !Array.isArray(deckData.commanders) || !Array.isArray(deckData.spells) || !Array.isArray(deckData.lands)) {
      validation.errors.push("Structure JSON invalide - manque commanders, spells ou lands");
      validation.isValid = false;
      return validation;
    }

    const totalCards = deckData.commanders.length + deckData.spells.length + deckData.lands.length;
    validation.cardCount = totalCards;

    if (totalCards !== COMMANDER_STRUCTURE.totalCards + 1) { // +1 pour le commandant
      validation.errors.push(`Nombre total incorrect: ${totalCards}/${COMMANDER_STRUCTURE.totalCards + 1}`);
      validation.isValid = false;
    }

    if (deckData.spells.length !== COMMANDER_STRUCTURE.totalCards - deckData.lands.length) {
      validation.warnings.push(`Déséquilibre sorts/terrains`);
    }

  } catch (error) {
    validation.errors.push(`Erreur de validation: ${error.message}`);
    validation.isValid = false;
  }

  return validation;
}

export const handler = async (event) => {
  const DEBUG = process.env.DEBUG_FUNCTION === "1";

  // Pré-vol CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS }, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { ...CORS }, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
    const USE_MOCK = process.env.USE_MOCK === "1";

    if (!OPENAI_API_KEY && !USE_MOCK) {
      return { 
        statusCode: 500, 
        headers: { ...CORS }, 
        body: JSON.stringify({ error: "Configuration API manquante" }) 
      };
    }

    let payload;
    try { 
      payload = JSON.parse(event.body || "{}"); 
    } catch {
      return { 
        statusCode: 400, 
        headers: { ...CORS }, 
        body: JSON.stringify({ error: "Corps JSON invalide." }) 
      };
    }

    const {
      commander,
      colorIdentity,
      budget = 50,
      mechanics = [],
      targetLands
    } = payload;

    if (!commander || typeof commander !== "string") {
      return { 
        statusCode: 400, 
        headers: { ...CORS }, 
        body: JSON.stringify({ error: "Paramètre 'commander' requis." }) 
      };
    }

    if (DEBUG) {
      console.log("Génération deck:", { commander, colorIdentity, budget, mechanics });
    }

    // Calcul de la structure des terrains
    const { lands, nonBasic, basic } = pickLandTargets(targetLands, colorIdentity);

    // Récupération des terrains via Scryfall
    const [nonBasicLands, basicLands] = await Promise.all([
      fetchNonBasicLands({ colorIdentity, count: nonBasic }),
      Promise.resolve(buildBasicLands({ colorIdentity, basicCount: basic }))
    ]);

    if (USE_MOCK) {
      // Version mock pour les tests
      const mockDeck = {
        commanders: [commander],
        spells: Array(COMMANDER_STRUCTURE.totalCards - lands).fill("Mock Spell").map((_, i) => `${_} ${i + 1}`),
        lands: [...basicLands, ...nonBasicLands]
      };

      return {
        statusCode: 200,
        headers: { ...CORS },
        body: JSON.stringify({
          success: true,
          deck: mockDeck,
          validation: validateDeck(mockDeck),
          debug: { mode: "mock", lands, nonBasic, basic }
        })
      };
    }

    // Génération avec OpenAI
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    if (DEBUG) {
      console.log("Envoi requête OpenAI...");
    }

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "Tu es un expert Magic: The Gathering qui génère des decks Commander. Tu réponds UNIQUEMENT en JSON valide avec exactement la structure demandée. Tu ne fais aucun commentaire, juste le JSON."
        },
        {
          role: "user",
          content: buildDeckPrompt({ 
            commander, 
            colorIdentity, 
            budget, 
            mechanics, 
            lands, 
            nonBasic, 
            basic 
          })
        }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    const deckContent = completion.choices[0].message.content;

    if (DEBUG) {
      console.log("Réponse OpenAI reçue, longueur:", deckContent.length);
    }

    // Parse et validation
    let deckData;
    try {
      deckData = JSON.parse(deckContent);
    } catch (parseError) {
      console.error("Erreur parsing JSON:", parseError);
      return {
        statusCode: 502,
        headers: { ...CORS },
        body: JSON.stringify({
          success: false,
          error: "Réponse JSON invalide de l'IA",
          details: DEBUG ? parseError.message : undefined
        })
      };
    }

    // Remplacer les terrains générés par ceux de Scryfall
    deckData.lands = [...basicLands, ...nonBasicLands];

    const validation = validateDeck(deckData);

    if (DEBUG) {
      console.log("Validation:", validation);
    }

    // Réponse finale
    const response = {
      success: true,
      deck: deckData,
      validation,
      metadata: {
        generated_at: new Date().toISOString(),
        model_used: MODEL,
        tokens_used: completion.usage?.total_tokens,
        structure_used: { lands, basic, nonBasic }
      }
    };

    return {
      statusCode: 200,
      headers: { ...CORS },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error("Erreur génération deck:", error);

    let errorMessage = "Erreur interne du serveur";
    let statusCode = 500;

    if (error.name === "SyntaxError") {
      errorMessage = "Réponse JSON invalide de l'IA";
      statusCode = 502;
    } else if (error.message?.includes("API key")) {
      errorMessage = "Erreur de configuration API";
    } else if (error.message?.includes("quota") || error.message?.includes("rate")) {
      errorMessage = "Quota API dépassé";
      statusCode = 429;
    } else if (error.message?.includes("model")) {
      errorMessage = "Modèle IA indisponible";
      statusCode = 502;
    }

    return {
      statusCode,
      headers: { ...CORS },
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        details: DEBUG ? error.message : undefined,
        timestamp: new Date().toISOString()
      })
    };
  }
};