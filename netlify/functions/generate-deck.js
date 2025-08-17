// netlify/functions/generate-deck.js
import OpenAI from “openai”;

// —–– CORS (dev cross-origin: localhost -> netlify.app) —––
const CORS = {
“Access-Control-Allow-Origin”: “*”,
“Access-Control-Allow-Headers”: “Content-Type, Authorization”,
“Access-Control-Allow-Methods”: “POST, OPTIONS”,
};

// ––––– Utils –––––
function ciToArray(ciString = “”) {
return (ciString || “”)
.split(””)
.map((c) => c.toUpperCase())
.filter((c) => [“W”, “U”, “B”, “R”, “G”].includes(c));
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
const ci = (colorIdentity || “”).toLowerCase();
const q = [
“t:land”, “-is:basic”, “legal:commander”, “game:paper”,
ci ? `ci<=${ci}` : “”
].filter(Boolean).join(” “);

const url = “https://api.scryfall.com/cards/search?q=” +
encodeURIComponent(q) +
“&unique=cards&order=edhrec”;

try {
const r = await fetch(url);
if (!r.ok) throw new Error(`Scryfall lands HTTP ${r.status}`);
const json = await r.json();
const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
return names.slice(0, count);
} catch (error) {
console.error(“Erreur fetch terrains:”, error);
// Terrains de fallback si Scryfall échoue
return getDefaultNonBasicLands(colorIdentity, count);
}
}

function getDefaultNonBasicLands(colorIdentity, count) {
const colors = ciToArray(colorIdentity);
const defaults = [
“Command Tower”, “Path of Ancestry”, “Exotic Orchard”,
“Reflecting Pool”, “City of Brass”, “Mana Confluence”,
“Unclaimed Territory”, “Ancient Ziggurat”, “Cavern of Souls”,
“Reliquary Tower”, “Rogue’s Passage”, “Temple of the False God”
];

// Ajouter des terrains spécifiques selon les couleurs
if (colors.length === 2) {
defaults.unshift(“Arcane Signet”, “Sol Ring”); // Pas des terrains mais pour l’exemple
}

return defaults.slice(0, count);
}

function buildBasicLands({ colorIdentity, basicCount }) {
const map = { W: “Plains”, U: “Island”, B: “Swamp”, R: “Mountain”, G: “Forest” };
const colors = ciToArray(colorIdentity);
const basics = [];

if (colors.length === 0) {
for (let i = 0; i < basicCount; i++) basics.push(“Wastes”);
return basics;
}

const perColor = Math.floor(basicCount / colors.length);
let rem = basicCount % colors.length;

for (const c of colors) {
for (let i = 0; i < perColor; i++) basics.push(map[c]);
if (rem > 0) {
basics.push(map[c]);
rem–;
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

const basic = Math.max(8, lands - nonBasic); // Minimum 8 terrains de base

return { lands, nonBasic, basic };
}

// Prompt optimisé pour OpenAI
function buildDeckPrompt({ commander, colorIdentity, budget, mechanics, lands, nonBasic, basic }) {
const colors = ciToArray(colorIdentity);
const budgetText = budget > 100 ? “élevé” : budget > 50 ? “moyen” : “faible”;
const mechanicsText = mechanics.length > 0 ? mechanics.join(”, “) : “synergie générale”;

return `Tu es un expert en Magic: The Gathering spécialisé en format Commander.

DECK À CONSTRUIRE:

- Commandant: ${commander}
- Identité de couleur: ${colors.join(””)}
- Budget: ${budgetText}
- Mécaniques: ${mechanicsText}

STRUCTURE OBLIGATOIRE (EXACTEMENT ${COMMANDER_STRUCTURE.totalCards} CARTES):

TERRAINS (${lands} cartes):

- ${basic} terrains de base (répartis équitablement entre les couleurs)
- ${nonBasic} terrains non-basiques (duals, utilitaires, spéciaux)

SORTS (${COMMANDER_STRUCTURE.totalCards - lands} cartes):

- ${COMMANDER_STRUCTURE.spells.creatures.target} créatures synergiques avec le commandant
- ${COMMANDER_STRUCTURE.spells.ramp.target} sorts de ramp/accélération
- ${COMMANDER_STRUCTURE.spells.removal.target} sorts de removal/interaction
- ${COMMANDER_STRUCTURE.spells.draw.target} sorts de pioche/avantage de cartes
- ${COMMANDER_STRUCTURE.spells.wincons.target} conditions de victoire/finishers
- ${COMMANDER_STRUCTURE.spells.utility.target} sorts utilitaires (enchantements, artefacts, etc.)

CONTRAINTES OBLIGATOIRES:

1. EXACTEMENT ${COMMANDER_STRUCTURE.totalCards} cartes (hors commandant)
1. Respecter l’identité de couleur: ${colors.join(””)}
1. Aucun doublon (sauf terrains de base)
1. Budget ${budgetText} - éviter les cartes trop chères si budget faible
1. Courbe de mana équilibrée (pic à 3-4 CMC)
1. Synergie forte avec le commandant et les mécaniques: ${mechanicsText}

FORMAT DE RÉPONSE OBLIGATOIRE - JSON STRICT:
{
“commander”: “${commander}”,
“totalCards”: ${COMMANDER_STRUCTURE.totalCards},
“lands”: {
“basics”: [${basic} noms de terrains de base],
“nonbasics”: [${nonBasic} noms de terrains non-basiques]
},
“spells”: {
“creatures”: [${COMMANDER_STRUCTURE.spells.creatures.target} noms de créatures],
“ramp”: [${COMMANDER_STRUCTURE.spells.ramp.target} noms de sorts de ramp],
“removal”: [${COMMANDER_STRUCTURE.spells.removal.target} noms de removals],
“draw”: [${COMMANDER_STRUCTURE.spells.draw.target} noms de sorts de pioche],
“wincons”: [${COMMANDER_STRUCTURE.spells.wincons.target} noms de conditions de victoire],
“utility”: [${COMMANDER_STRUCTURE.spells.utility.target} noms d’autres sorts]
}
}

IMPORTANT: Chaque liste doit contenir EXACTEMENT le nombre indiqué de cartes. Vérifie tes comptes !`;
}

// Validation du deck généré
function validateDeck(deckData) {
const validation = {
isValid: true,
errors: [],
warnings: [],
cardCount: 0,
breakdown: {}
};

try {
if (!deckData || !deckData.lands || !deckData.spells) {
validation.errors.push(“Structure JSON manquante ou invalide”);
validation.isValid = false;
return validation;
}

```
// Compter les cartes par catégorie
const landsCount = (deckData.lands.basics?.length || 0) + (deckData.lands.nonbasics?.length || 0);

const spellCategories = ['creatures', 'ramp', 'removal', 'draw', 'wincons', 'utility'];
let spellsCount = 0;

spellCategories.forEach(category => {
  const count = deckData.spells[category]?.length || 0;
  validation.breakdown[category] = count;
  spellsCount += count;
});

validation.breakdown.lands = landsCount;
validation.breakdown.basics = deckData.lands.basics?.length || 0;
validation.breakdown.nonbasics = deckData.lands.nonbasics?.length || 0;
validation.cardCount = landsCount + spellsCount;

// Validation nombre total
if (validation.cardCount !== COMMANDER_STRUCTURE.totalCards) {
  validation.errors.push(`Nombre total incorrect: ${validation.cardCount}/${COMMANDER_STRUCTURE.totalCards}`);
  validation.isValid = false;
}

// Validation équilibrage
if (landsCount < COMMANDER_STRUCTURE.lands.min || landsCount > COMMANDER_STRUCTURE.lands.max) {
  validation.warnings.push(`Terrains déséquilibrés: ${landsCount} (recommandé: ${COMMANDER_STRUCTURE.lands.target})`);
}

if (validation.breakdown.basics < 8) {
  validation.warnings.push(`Pas assez de terrains de base: ${validation.breakdown.basics} (minimum recommandé: 8)`);
}

// Validation des catégories de sorts
spellCategories.forEach(category => {
  const count = validation.breakdown[category];
  const target = COMMANDER_STRUCTURE.spells[category];
  if (target && (count < target.min || count > target.max)) {
    validation.warnings.push(`${category}: ${count} (recommandé: ${target.target})`);
  }
});
```

} catch (error) {
validation.errors.push(`Erreur de validation: ${error.message}`);
validation.isValid = false;
}

return validation;
}

// ––––– Handler –––––
export const handler = async (event) => {
const DEBUG = process.env.DEBUG_FUNCTION === “1”;

// Pré-vol CORS
if (event.httpMethod === “OPTIONS”) {
return { statusCode: 204, headers: { …CORS }, body: “” };
}

try {
if (event.httpMethod !== “POST”) {
return { statusCode: 405, headers: { …CORS }, body: JSON.stringify({ error: “Method Not Allowed” }) };
}

```
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
  ownedCards = [],
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

// Récupération des terrains via Scryfall (en parallèle)
const [nonBasicLands, basicLands] = await Promise.all([
  fetchNonBasicLands({ colorIdentity, count: nonBasic }),
  Promise.resolve(buildBasicLands({ colorIdentity, basicCount: basic }))
]);

if (USE_MOCK) {
  // Version mock pour les tests
  const mockDeck = {
    commander,
    totalCards: COMMANDER_STRUCTURE.totalCards,
    lands: {
      basics: basicLands,
      nonbasics: nonBasicLands
    },
    spells: {
      creatures: Array(COMMANDER_STRUCTURE.spells.creatures.target).fill("Mock Creature"),
      ramp: Array(COMMANDER_STRUCTURE.spells.ramp.target).fill("Mock Ramp"),
      removal: Array(COMMANDER_STRUCTURE.spells.removal.target).fill("Mock Removal"),
      draw: Array(COMMANDER_STRUCTURE.spells.draw.target).fill("Mock Draw"),
      wincons: Array(COMMANDER_STRUCTURE.spells.wincons.target).fill("Mock Wincon"),
      utility: Array(COMMANDER_STRUCTURE.spells.utility.target).fill("Mock Utility")
    }
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

const completion = await openai.chat.completions.create({
  model: MODEL,
  messages: [
    {
      role: "system",
      content: "Tu es un expert Magic: The Gathering qui génère des decks Commander équilibrés. Tu réponds UNIQUEMENT en JSON valide avec la structure exacte demandée. Tu comptes soigneusement chaque carte pour respecter les quotas."
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
  console.log("Réponse OpenAI:", deckContent.substring(0, 300) + "...");
}

// Parse et validation
const deckData = JSON.parse(deckContent);

// Remplacer les terrains générés par ceux de Scryfall
deckData.lands = {
  basics: basicLands,
  nonbasics: nonBasicLands
};

const validation = validateDeck(deckData);

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

if (DEBUG) {
  console.log("Validation:", validation);
}

return {
  statusCode: 200,
  headers: { ...CORS },
  body: JSON.stringify(response)
};
```

} catch (error) {
console.error(“Erreur génération deck:”, error);

```
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
```

}
};