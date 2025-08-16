// Fichier: hooks.js
import { useState, useEffect } from "react";
import { resolveCommanderByAnyName, isCommanderLegal, getCI } from "./utils";

export function useCommanderResolution(mode, chosen, setCI, setError) {
  const [card, setCard] = useState(null);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (mode !== "select" || !chosen) {
        setCard(null);
        return;
      }
      try {
        const c = await resolveCommanderByAnyName(chosen);
        if (!ok) return;
        if (!isCommanderLegal(c)) throw new Error("Commandant illégal en EDH");
        setCard(c);
        setCI(getCI(c));
      } catch (e) {
        if (ok) {
          setCard(null);
          setError(String(e.message || e));
        }
      }
    })();
    return () => {
      ok = false;
    };
  }, [mode, chosen, setCI, setError]);

  return card;
}
