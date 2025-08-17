// Fichier: netlify/functions/generate-deck.js (Version finale avec logique de mana déportée)

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
  // ÉTAPE 1 : L'IA CHOISIT UNIQUEMENT LES SORTS
  // ==================================================================

  const nonLandSlots = 99 - targetLands;
  const creatureSlots = 25;
  const supportSlots = nonLandSlots - creatureSlots;

  const prompt = `
    Tu es un expert en construction de deck pour Magic: The Gathering.
    Ta mission est de sélectionner une liste de **${nonLandSlots} sorts non-terrain** pour un deck Commander.
    NE PAS inclure de terrains.

    **DONNÉES :**
    - Commandant: "${commander}"
    - Identité Couleur: "${colorIdentity}"
    - Budget: ${budget} EUR pour l'ensemble du deck.
    - Thèmes: ${mechanics.join(', ') || 'Synergie générale'}
    - Cartes possédées (à prioriser si possible): ${ownedCards.slice(0, 50).join(', ')}

    **INSTRUCTIONS STRICTES :**
    1.  Tu dois sélectionner EXACTEMENT **${nonLandSlots} cartes** au total.
    2.  Respecte la répartition suivante :
        - **${creatureSlots} Créatures**
        - **10 cartes d'Accélération (Ramp)**
        - **10 cartes de Pioche (Draw)**
        - **8 cartes de Gestion (Removal)**
        - **4 cartes de Nettoyage de Table (Board Wipes)**
        - **${supportSlots - (10 + 10 + 8 + 4)} cartes "Flex"** pour les thèmes.
    3.  Toutes les cartes doivent respecter l'identité couleur.
    4.  Toutes les cartes doivent être en un seul exemplaire.

    **FORMAT DE SORTIE (JSON STRICT) :**
    Réponds UNIQUEMENT avec un objet JSON. Ne fournis aucun texte avant ou après.
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
    // ÉTAPE 2 : NOTRE CODE CONSTRUIT LA BASE DE MANA
    // ==================================================================
    const colorCount = colorIdentity.length;
    let nonBasicLandCount;
    let basicLandCount;

    if (colorCount <= 1) { // 85% basiques
        nonBasicLandCount = Math.round(targetLands * 0.15);
    } else if (colorCount === 2) { // 50% basiques
        nonBasicLandCount = Math.round(targetLands * 0.50);
    } else if (colorCount === 3) { // 33% basiques
        nonBasicLandCount = Math.round(targetLands * 0.67);
    } else { // 15% basiques
        nonBasicLandCount = Math.round(targetLands * 0.85);
    }
    basicLandCount = targetLands - nonBasicLandCount;

    // Recherche des meilleurs terrains non-basiques sur Scryfall
    const scryfallQuery = `(type:land -type:basic) legal:commander ci<=${colorIdentity} order:edhrec usd<${budget > 0 ? budget/10 : 10}`;
    const scryfallResponse = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}`);
    const scryfallJson = await scryfallResponse.json();

    const nonBasicLands = scryfallJson.data
        .map(card => card.name)
        .slice(0, nonBasicLandCount);

    // Ajout des terrains de base
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
    } else { // Incolore
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
