// Fichier: netlify/functions/hello.js

export const handler = async (event) => {
  // Cette ligne devrait TOUJOURS apparaître dans les logs si la fonction est appelée.
  console.log("La fonction 'hello' a été appelée !");

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Bonjour, le système de fonctions fonctionne !" }),
  };
};
