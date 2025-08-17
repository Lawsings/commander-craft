// Fichier: netlify/functions/generate-deck.js (Version finale avec VOS pourcentages)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Configuration serveur incorrecte: clé API manquante." }),
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  const params = JSON.parse(event.body);
  const { commander, colorIdentity, budget, mechanics, targetLands, ownedCards } = params;

  // ==================================================================
  // ÉTAPE 1 : L'IA CHOISIT UNIQUEMENT LES SORTS (INCHANGÉ)
  // ==================================================================

  const nonLandSlots = 99 - targetLands;

  const prompt = `
    Tu es un expert en construction de deck pour Magic: The Gathering.
    Ta mission est de sélectionner une liste de **${nonLandSlots} sorts non-terrain** pour un deck Commander.
    NE PAS inclure de terrains.

    **DONNÉES :**
    - Commandant: "${commander}"
    - Identité Couleur: "${colorIdentity}"
    - Budget: ${budget} EUR pour l'ensemble du deck.

    **INSTRUCTIONS STRICTES :**
    1.  Tu dois sélectionner EXACTEMENT **${nonLandSlots} cartes**.
    2.  Respecte une répartition équilibrée : environ 25 créatures, 10 ramp, 10 pioche, 12 interaction (removal/wipes), et le reste en cartes de synergie.
    3.  Toutes les cartes doivent respecter l'identité couleur et être en un seul exemplaire.

    **FORMAT DE SORTIE (JSON STRICT) :**
    {
      "spells": [/* Une liste de ${nonLandSlots} noms de cartes */]
    }
  `;

  try {
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" },
        safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
        ]
      }),
    });

    const aiResponseBody = await aiResponse.json();
    if (!aiResponse.ok) throw new Error(aiResponseBody?.error?.message || `Erreur API Gemini`);

    const generatedText = aiResponseBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) throw new Error("L'IA n'a pas pu générer de liste de sorts.");

    const aiDeckPart = JSON.parse(generatedText);
    const spells = aiDeckPart.spells;

    // ==================================================================
    // ÉTAPE 2 : LE CODE CONSTRUIT LA BASE DE MANA AVEC VOS RÈGLES
    // ==================================================================
    const colorCount = colorIdentity.length;
    let basicLandPercentage;

    // Application stricte de votre analyse en pourcentage
    if (colorCount <= 1) {
        basicLandPercentage = 0.85; // ~85% de terrains de base
    } else if (colorCount === 2) {
        basicLandPercentage = 0.50; // ~50% de terrains de base
    } else if (colorCount === 3) {
        basicLandPercentage = 0.33; // ~33% de terrains de base
    } else { // 4 ou 5 couleurs
        basicLandPercentage = 0.20; // ~20% de terrains de base
    }

    // Calcul exact basé sur les pourcentages
    const basicLandCount = Math.round(targetLands * basicLandPercentage);
    const nonBasicLandCount = targetLands - basicLandCount;

    // Recherche des meilleurs terrains non-basiques ("avec effet") sur Scryfall
    // J'ajoute -t:basic pour être absolument certain de n'avoir que des terrains non-basiques
    const scryfallQuery = `(type:land -type:basic) legal:commander ci<=${colorIdentity} order:edhrec usd<${budget > 0 ? budget / 10 : 10}`;
    const scryfallResponse = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}`);
    const scryfallJson = await scryfallResponse.json();

    const nonBasicLands = scryfallJson.data && scryfallJson.data.length > 0
        ? scryfallJson.data.map(card => card.name).slice(0, nonBasicLandCount)
        : [];

    // Ajout des terrains de base ("sans effet")
    const basicLands = [];
    const basicsByColor = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
    if (colorCount > 0) {
        const perColor = Math.floor(basicLandCount / colorCount);
        let remainder = basicLandCount % colorCount;
        for (const color of colorIdentity.split('')) {
            const count = perColor + (remainder > 0 ? 1 : 0);
            for (let i = 0; i < count; i++) {
                basicLands.push(basicsByColor[color]);
            }
            remainder--;
        }
    } else if (basicLandCount > 0) { // Incolore
        for (let i = 0; i < basicLandCount; i++) {
            basicLands.push("Wastes");
        }
    }

    const finalDeck = {
        commanders: [commander],
        spells: spells,
        lands: [...nonBasicLands, ...basicLands]
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalDeck),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
