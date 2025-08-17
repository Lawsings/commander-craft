// Fichier: netlify/functions/generate-deck.js (Version de débogage)

export const handler = async (event) => {
  // Le tout premier log. S'il n'apparaît pas, le problème est avant l'exécution.
  console.log("Fonction 'generate-deck' (version de test) appelée.");
  console.log("Méthode HTTP:", event.httpMethod);
  console.log("Corps de la requête:", event.body);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "Le test de la fonction generate-deck a réussi !" }),
  };
};
