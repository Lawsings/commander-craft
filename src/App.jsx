// Fichier: src/App.jsx (Complet et Nettoyé)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Settings2, Info, Sparkles, Trash2, Sun, Moon } from "lucide-react";

// Import des modules séparés
import './index.css';
import {
  MECHANIC_TAGS, RE, sleep, ciMask, identityToQuery, nameOf, oracle,
  isCommanderLegal, getCI, priceEUR,
  sf, bundleCard, bundleByName, primaryTypeLabel, parseCollectionFile,
  fetchCommanderDeckCount, WIN_CONDITIONS, GAME_CHANGERS
} from './utils.js';
import { useCommanderResolution } from './hooks.js';
import CommanderAutocomplete from './components/CommanderAutocomplete.jsx';
import FileDrop from './components/FileDrop.jsx';
import Progress from './components/Progress.jsx';
import CardTile from './components/CardTile.jsx';
import CardModal from './components/CardModal.jsx';

// Composant pour la modale de progression
const GenerationModal = ({ progress }) => (
  <div className="generation-modal-overlay">
    <div className="generation-modal-content">
      <h3 className="text-lg font-medium">Construction de votre deck...</h3>
      <p className="text-sm muted mt-2">{progress.step} ({progress.percent}%)</p>
      <div className="generation-progress-bar-bg">
        <div className="generation-progress-bar-fill" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  </div>
);

export default function App() {
  // THEME
  const initialTheme = useMemo(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      return 'dark';
    } catch { return 'dark'; }
  }, []);
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { }
  }, [theme]);

  // UI state
  const [error, setError] = useState("");
  const [deck, setDeck] = useState(null);
  const [commanderMode, setCommanderMode] = useState("random");
  const [chosenCommander, setChosenCommander] = useState("");
  const [desiredCI, setDesiredCI] = useState("");
  const [targetLands, setTargetLands] = useState(37);
  const [deckBudget, setDeckBudget] = useState(50);
  const [mechanics, setMechanics] = useState([]);
  const [limitNotice, setLimitNotice] = useState("");
  const [targets, setTargets] = useState({ ramp: { min: 10, max: 12 }, draw: { min: 9, max: 12 }, removal: { min: 8, max: 10 }, wraths: { min: 3, max: 5 } });
  const [ownedMap, setOwnedMap] = useState(new Map());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalOwned, setModalOwned] = useState(false);
  const [commandersExtraInfo, setCommandersExtraInfo] = useState({});
  const [specialCards, setSpecialCards] = useState({ winCons: new Set(), gameChangers: new Set() });
  const [generationProgress, setGenerationProgress] = useState({ active: false, step: '', percent: 0 });

  const commanderSectionRef = useRef(null);
  const IDENTITY_COLOR_ORDER = ['W', 'B', 'U', 'G', 'R'];

  const selectedCommanderCard = useCommanderResolution(commanderMode, chosenCommander, setDesiredCI, setError);
  const toggleMechanic = (key) => setMechanics(prev => prev.includes(key) ? prev.filter(k => k !== key) : (prev.length >= 3 ? (setLimitNotice("Maximum 3 mécaniques à la fois"), setTimeout(() => setLimitNotice(""), 1500), prev) : [...prev, key]));

  const countCats = (cards) => cards.reduce((a, c) => ({ ramp: a.ramp + (RE.RAMP.test(oracle(c)) ? 1 : 0), draw: a.draw + (RE.DRAW.test(oracle(c)) ? 1 : 0), removal: a.removal + (RE.REMOVAL.test(oracle(c)) ? 1 : 0), wraths: a.wraths + (RE.WRATHS.test(oracle(c)) ? 1 : 0) }), { ramp: 0, draw: 0, removal: 0, wraths: 0 });
  const pickCommander = async (ci) => { if (commanderMode === 'select' && selectedCommanderCard) return selectedCommanderCard; const q = ["legal:commander", "is:commander", "game:paper", "-is:funny", ci ? identityToQuery(ci) : "", "(type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background)"].filter(Boolean).join(" "); for (let i = 0; i < 6; i++) { const c = await sf.random(q); if (!isCommanderLegal(c)) continue; if (oracle(c).includes("companion")) continue; return c; } throw new Error("Impossible de trouver un commandant aléatoire conforme."); };
  async function buildLandCards(landsMap) { const out = []; for (const [n, q] of Object.entries(landsMap)) { try { const b = await bundleByName(n); out.push({ ...b, qty: q }); } catch { out.push({ name: n, qty: q, image: "", small: "", oracle_en: "", mana_cost: "", cmc: 0, prices: {}, scryfall_uri: "" }); } await sleep(60); } return out; }
  const identifySpecialCards = (cards) => {
    const winCons = new Set();
    const gameChangers = new Set();
    cards.forEach(card => {
      const cardName = nameOf(card).toLowerCase();
      if (WIN_CONDITIONS.has(cardName)) winCons.add(nameOf(card));
      if (GAME_CHANGERS.has(cardName) || RE.WRATHS.test(oracle(card))) gameChangers.add(nameOf(card));
    });
    setSpecialCards({ winCons, gameChangers });
  };

  const generate = async () => {
    setError("");
    setDeck(null);
    setCommandersExtraInfo({});
    setSpecialCards({ winCons: new Set(), gameChangers: new Set() });
    setGenerationProgress({ active: true, step: 'Initialisation...', percent: 0 });

    let finalCommanderCard;
    try {
      setGenerationProgress({ active: true, step: 'Sélection du commandant...', percent: 10 });
      finalCommanderCard = (commanderMode === 'select' && selectedCommanderCard) ? selectedCommanderCard : await pickCommander(desiredCI);
    } catch (e) {
      setError(e.message || String(e));
      setGenerationProgress({ active: false, step: '', percent: 0 });
      return;
    }

    const finalCommanderName = nameOf(finalCommanderCard);
    const finalCI = getCI(finalCommanderCard);

    setGenerationProgress({ active: true, step: 'Envoi de la requête à l\'IA...', percent: 25 });

    try {
      const response = await fetch('/.netlify/functions/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commander: finalCommanderName,
          colorIdentity: finalCI,
          budget: Number(deckBudget) || 0,
          mechanics: mechanics,
          ownedCards: Array.from(ownedMap.keys()),
          targetLands: targetLands,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const err = await response.json();
          throw new Error(err.error || 'La génération du deck a échoué.');
        } else {
          throw new Error(`Erreur serveur: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();

      if (!result.success || !result.deck) {
        throw new Error(result.error || 'Réponse invalide du serveur');
      }

      const aiDeck = result.deck;
      console.log('Structure reçue de l\'API:', aiDeck);

      // Logs de débogage pour voir ce que l'API renvoie
      console.log('Spells from API:', aiDeck.spells?.slice(0, 10));
      console.log('Lands from API:', aiDeck.lands?.slice(0, 10));
      console.log('Commanders from API:', aiDeck.commanders);

      setGenerationProgress({ active: true, step: 'Récupération des données des cartes...', percent: 50 });

      const allSpellNames = aiDeck.spells || [];
      const allLandNames = aiDeck.lands || [];
      const commanderNames = aiDeck.commanders || [finalCommanderName];

      console.log('Sorts extraits:', allSpellNames.length);
      console.log('Terrains extraits:', allLandNames.length);
      console.log('Commandants extraits:', commanderNames.length);

      // Récupérer les données complètes des cartes depuis Scryfall
      const allNames = [...new Set([...commanderNames, ...allSpellNames, ...allLandNames])];

      setGenerationProgress({ active: true, step: 'Récupération des cartes depuis Scryfall...', percent: 75 });

      // Remplacer la section de récupération des cartes Scryfall par ceci :

    const cardPromises = allNames.map(async (name) => {
      try {
        const cleanName = name.split('//')[0].trim();
        const card = await sf.namedExact(cleanName);
        return { original: name, card, found: true };
      } catch (error) {
        console.warn(`Carte non trouvée: ${name}`, error);
        return { original: name, card: null, found: false };
      }
    });

    const cardResults = await Promise.all(cardPromises);
    const validCards = cardResults.filter(r => r.found).map(r => r.card);
    const missingCards = cardResults.filter(r => !r.found);

    console.log('Cartes trouvées sur Scryfall:', validCards.length);
    console.log('Cartes manquantes:', missingCards.length, missingCards.map(m => m.original));

    // Calculer les cartes manquantes par catégorie
    const missingSpells = missingCards.filter(m => allSpellNames.includes(m.original)).length;
    const missingLands = missingCards.filter(m => allLandNames.includes(m.original)).length;

    if (missingCards.length > 0) {
      console.warn(`${missingCards.length} cartes non trouvées:`, {
        sorts: missingSpells,
        terrains: missingLands
      });
    }

    // Ajuster les totaux attendus en fonction des cartes manquantes
    const expectedNonlands = allSpellNames.length - missingSpells;
    const expectedLands = allLandNames.length - missingLands;

    console.log('Totaux attendus après ajustement:', {
      sorts: expectedNonlands,
      terrains: expectedLands,
      total: expectedNonlands + expectedLands + 1 // +1 pour le commandant
    });

      const cardResults = await Promise.all(cardPromises);
      const validCards = cardResults.filter(Boolean);

      console.log('Cartes trouvées sur Scryfall:', validCards.length);

      // Logs pour voir les types de cartes
      console.log('Exemples de cartes trouvées:', validCards.slice(0, 10).map(c => ({
        name: nameOf(c),
        type_line: c.type_line,
        isLand: c.type_line.toLowerCase().includes('land')
      })));

      // NOUVELLE LOGIQUE DE FILTRAGE - Plus robuste
      const commandersFull = [];
      const nonlandCardsRaw = [];
      const landCardsRaw = [];

      // Créer des sets pour une recherche plus efficace
      const commanderSet = new Set(commanderNames.map(name => name.split('//')[0].trim().toLowerCase()));
      const spellSet = new Set(allSpellNames.map(name => name.split('//')[0].trim().toLowerCase()));
      const landSet = new Set(allLandNames.map(name => name.split('//')[0].trim().toLowerCase()));

      validCards.forEach(card => {
        const cardName = nameOf(card).toLowerCase();
        const isLandType = card.type_line.toLowerCase().includes('land');

        // D'abord vérifier si c'est un commandant
        if (commanderSet.has(cardName)) {
          commandersFull.push(card);
        }
        // Ensuite vérifier si c'est un terrain (soit dans la liste, soit par type)
        else if (landSet.has(cardName) || isLandType) {
          landCardsRaw.push(card);
        }
        // Sinon c'est un sort non-terrain
        else if (spellSet.has(cardName)) {
          nonlandCardsRaw.push(card);
        }
        // Fallback : si la carte n'est dans aucune liste mais n'est pas un terrain
        else if (!isLandType) {
          console.log(`Carte non catégorisée ajoutée aux sorts: ${nameOf(card)}`);
          nonlandCardsRaw.push(card);
        }
      });

      console.log('Après filtrage amélioré:');
      console.log('Commandants organisés:', commandersFull.length);
      console.log('Sorts non-terrains organisés:', nonlandCardsRaw.length);
      console.log('Terrains organisés:', landCardsRaw.length);

      // Si on n'a toujours pas de sorts, c'est un problème avec l'API
      if (nonlandCardsRaw.length === 0 && allSpellNames.length > 0) {
        console.error('PROBLÈME: Aucun sort non-terrain trouvé malgré', allSpellNames.length, 'sorts dans la réponse API');
        console.log('Premiers sorts de l\'API:', allSpellNames.slice(0, 5));

        // Essayons de forcer l'ajout de cartes non-terrains
        const fallbackNonlands = validCards.filter(card => {
          const isLand = card.type_line.toLowerCase().includes('land');
          const isCommander = commanderSet.has(nameOf(card).toLowerCase());
          return !isLand && !isCommander;
        });

        console.log('Cartes non-terrains trouvées en fallback:', fallbackNonlands.length);
        nonlandCardsRaw.push(...fallbackNonlands);
      }

      // Créer la map des terrains avec quantités
      const landsMap = {};
      allLandNames.forEach(landName => {
        const normalizedName = landName.split('//')[0].trim();
        landsMap[normalizedName] = (landsMap[normalizedName] || 0) + 1;
      });

      // Calculer le prix total
      const spent = validCards.reduce((total, card) => total + priceEUR(card), 0);

      // Identifier les cartes spéciales
      identifySpecialCards([...commandersFull, ...nonlandCardsRaw]);

      // Récupérer les infos EDHREC pour les commandants
      fetchCommanderDeckCount(finalCommanderName).then(deckCount => {
        if(deckCount) {
          setCommandersExtraInfo({ [finalCommanderName]: { deckCount } });
        }
      }).catch(() => {});

      setGenerationProgress({ active: true, step: 'Finalisation...', percent: 95 });

      const finalDeck = {
        colorIdentity: finalCI,
        commanders: commandersFull.map(nameOf),
        commandersFull: commandersFull.map(bundleCard),
        nonlands: nonlandCardsRaw.reduce((acc, c) => ({...acc, [nameOf(c)]: 1 }), {}),
        nonlandCards: nonlandCardsRaw.map(bundleCard),
        lands: landsMap,
        landCards: await buildLandCards(landsMap),
        budget: Number(deckBudget) || 0,
        spent: Number(spent.toFixed(2)),
        balanceTargets: targets,
        balanceCounts: countCats(nonlandCardsRaw)
      };

      console.log('Deck final construit:', {
        commandants: finalDeck.commanders.length,
        nonlands: Object.keys(finalDeck.nonlands).length,
        lands: Object.keys(finalDeck.lands).length,
        total: finalDeck.commanders.length + Object.values(finalDeck.nonlands).reduce((a,b) => a+b, 0) + Object.values(finalDeck.lands).reduce((a,b) => a+b, 0)
      });

      await sleep(500);

    // À ajouter juste avant setDeck(finalDeck) :

        const finalTotal = finalDeck.commanders.length +
                          Object.values(finalDeck.nonlands).reduce((a,b) => a+b, 0) +
                          Object.values(finalDeck.lands).reduce((a,b) => a+b, 0);

        console.log('Validation finale:', {
          commandants: finalDeck.commanders.length,
          sorts: Object.values(finalDeck.nonlands).reduce((a,b) => a+b, 0),
          terrains: Object.values(finalDeck.lands).reduce((a,b) => a+b, 0),
          total: finalTotal,
          objectif: 100
        });

        if (finalTotal !== 100) {
          console.warn(`⚠️ Deck incomplet: ${finalTotal}/100 cartes`);
          // Optionnel : afficher un avertissement à l'utilisateur
          // setError(`Attention: Le deck généré contient ${finalTotal}/100 cartes à cause de cartes non trouvées.`);
        }
      setDeck(finalDeck);

    } catch (e) {
      console.error('Erreur lors de la génération:', e);
      setError(e.message || 'Une erreur inattendue s\'est produite');
    } finally {
      setGenerationProgress({ active: false, step: '', percent: 0 });
    }
  };

  useEffect(() => {
    if (deck) commanderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [deck]);

  const download = (filename, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); };
  const exportTxt = () => { if (deck) { const lines = [...deck.commanders.map(c => `1 ${c}`), ...Object.entries(deck.nonlands).map(([n, q]) => `${q} ${n}`), ...Object.entries(deck.lands).map(([n, q]) => `${q} ${n}`)]; download("commander-deck.txt", lines.join("\n")); } };
  const exportJson = () => { if (deck) download("commander-deck.json", JSON.stringify(deck, null, 2)); };
  const copyList = () => { if (!deck) return; const lines = [`// CI: ${deck.colorIdentity || "(Colorless)"} • Budget: ${deck.budget || 0}€ • Coût estimé: ${deck.spent || 0}€`, ...deck.commanders.map(c => `1 ${c} // Commander`), ...Object.entries(deck.nonlands).map(([n, q]) => `${q} ${n}`), ...Object.entries(deck.lands).map(([n, q]) => `${q} ${n}`)]; navigator.clipboard.writeText(lines.join("\n")); };

  const handleCollectionFile = async (f) => { if (!f) return; const parsed = await parseCollectionFile(f); const entry = { id: `${Date.now()}-${Math.random()}`, name: f.name, map: parsed }; setUploadedFiles(prev => { const next = [...prev, entry]; const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; }); };
  const removeUploadedFile = (id) => setUploadedFiles(prev => { const next = prev.filter(x => x.id !== id); const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; });
  const clearCollection = () => { setOwnedMap(new Map()); setUploadedFiles([]); };

  const reequilibrer = () => alert("Le rééquilibrage intelligent via l'IA sera bientôt disponible ! Pour l'instant, vous pouvez générer un nouveau deck avec les mêmes paramètres.");

  const deckSize = useMemo(() => { if (!deck) return 0; return (deck.commanders?.length || 0) + Object.values(deck?.nonlands || {}).reduce((a, b) => a + b, 0) + Object.values(deck?.lands || {}).reduce((a, b) => a + b, 0); }, [deck]);
  const nonlandsByType = useMemo(() => { if (!deck?.nonlandCards) return {}; const groups = {}; for (const c of deck.nonlandCards) { const k = primaryTypeLabel(c.type_line); (groups[k] ||= []).push(c); } const order = ["Créatures", "Artefacts", "Enchantements", "Éphémères", "Rituels", "Planeswalkers", "Batailles", "Autres"]; const sorted = {}; for (const k of order) { if (groups[k]) sorted[k] = groups[k]; } return sorted; }, [deck]);
  const isOwned = (cardName) => ownedMap.has((cardName || "").toLowerCase());
  const stats = useMemo(() => {
    if (!deck) return null;
    const own = new Map(ownedMap);
    let ownedCount = 0;
    const countOwned = (name, qty) => { const k = name.toLowerCase(); const have = own.get(k) || 0; const used = Math.min(have, qty); if (used > 0) own.set(k, have - used); return used; };
    (deck.commanders || []).forEach(n => ownedCount += countOwned(n, 1));
    Object.entries(deck.nonlands || {}).forEach(([n, q]) => ownedCount += countOwned(n, q));
    Object.entries(deck.lands || {}).forEach(([n, q]) => ownedCount += countOwned(n, q));
    const total = deckSize;
    const ownedPct = total ? Math.round((ownedCount / total) * 100) : 0;
    const cmcCards = [...(deck.commandersFull || []), ...(deck.nonlandCards || [])];
    const avgCmc = cmcCards.length ? (cmcCards.reduce((a, c) => a + (Number(c.cmc) || 0), 0) / cmcCards.length) : 0;
    return { ownedCount, ownedPct, avgCmc: Number(avgCmc.toFixed(2)), typeCounts: Object.fromEntries(Object.entries(nonlandsByType).map(([k, arr]) => [k, arr.length])) };
  }, [deck, ownedMap, deckSize, nonlandsByType]);

  return (
    <div className="min-h-screen">
      {generationProgress.active && <GenerationModal progress={generationProgress} />}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="header-wrap lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-center gap-3">
            <img src="/commander-craft-logo.png" alt="Commander Craft Logo" className="h-12 w-12 md:h-14 md:w-14" />
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight"> Commander Craft</h1>
          </div>
          <div className="header-actions lg:flex lg:gap-2 lg:w-auto">
            <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Basculer thème">
              {theme === 'dark' ? (<><Sun className="h-4 w-4" /><span>Mode clair</span></>) : (<><Moon className="h-4 w-4" /><span>Mode sombre</span></>)}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 mt-8">
          {/* Section Paramètres */}
          <div className="glass p-6">
            <div className="flex items-center gap-2 mb-4"><Settings2 className="h-5 w-5" /><h2 className="font-medium">Paramètres</h2></div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4">
              {/* Colonne 1 */}
              <div className="flex flex-col space-y-4">
                <div className="space-y-2">
                  <span className="muted text-sm">Commandant</span>
                  <div className="flex gap-2 flex-wrap">
                    <button className={`btn ${commanderMode === 'random' ? 'glass-strong' : ''}`} onClick={() => { setCommanderMode('random'); setChosenCommander(""); }}>Aléatoire</button>
                    <button className={`btn ${commanderMode === 'select' ? 'glass-strong' : ''}`} onClick={() => setCommanderMode('select')}>Sélectionner</button>
                  </div>
                  {commanderMode === 'select' && (
                    <div className="mt-2">
                      <CommanderAutocomplete value={chosenCommander} onSelect={setChosenCommander} />
                      {selectedCommanderCard && (<p className="text-xs muted mt-1">Sélectionné: <span className="text-card-foreground">{nameOf(selectedCommanderCard)}</span> • Identité: {getCI(selectedCommanderCard)}</p>)}
                    </div>
                  )}
                </div>
                {commanderMode !== 'select' && (
                  <div>
                    <span className="muted text-sm">Identité couleur (optionnel)</span>
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <button className="btn p-2.5" onClick={() => setDesiredCI("")} title="Aucune couleur (Réinitialiser)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
                      </button>
                      {IDENTITY_COLOR_ORDER.map(c => (<button key={c} className={`btn p-2 ${desiredCI.includes(c) ? 'glass-strong' : ''}`} onClick={() => { const set = new Set(desiredCI.split("")); set.has(c) ? set.delete(c) : set.add(c); setDesiredCI(ciMask(Array.from(set).join(""))); }}><img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} alt={c} style={{ width: '24px', height: '24px', display: 'block' }} /></button>))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="muted text-sm">Mécaniques préférées (max 3)</span>
                  <div className="mt-2">
                    <div className="mechanic-category">Catégorie S (Les plus populaires)</div>
                    <div className="flex flex-wrap gap-2">
                      {MECHANIC_TAGS.filter(m => m.category === 'S').map(m => (<button key={m.key} className={`btn text-xs ${mechanics.includes(m.key) ? 'glass-strong' : ''}`} onClick={() => toggleMechanic(m.key)}>{m.label}</button>))}
                    </div>
                    <div className="mechanic-category">Catégorie A (Très courants)</div>
                    <div className="flex flex-wrap gap-2">
                      {MECHANIC_TAGS.filter(m => m.category === 'A').map(m => (<button key={m.key} className={`btn text-xs ${mechanics.includes(m.key) ? 'glass-strong' : ''}`} onClick={() => toggleMechanic(m.key)}>{m.label}</button>))}
                    </div>
                    <div className="mechanic-category">Catégorie B (Populaires)</div>
                    <div className="flex flex-wrap gap-2">
                      {MECHANIC_TAGS.filter(m => m.category === 'B').map(m => (<button key={m.key} className={`btn text-xs ${mechanics.includes(m.key) ? 'glass-strong' : ''}`} onClick={() => toggleMechanic(m.key)}>{m.label}</button>))}
                    </div>
                  </div>
                  {limitNotice && <p className="text-xs" style={{ color: 'var(--warn)' }}>{limitNotice}</p>}
                </div>
              </div>

              {/* Colonne 2 */}
              <div className="flex flex-col space-y-4">
                <div><label className="muted text-sm">Nombre de terrains visé: {targetLands}</label><input type="range" min={32} max={40} step={1} value={targetLands} onChange={e => setTargetLands(Number(e.target.value))} className="w-full" /></div>
                <div>
                  <label className="muted text-sm">Budget global du deck (EUR)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0 = sans limite" value={deckBudget || ''} onChange={e => setDeckBudget(Number(e.target.value.replace(/\D/g,'')) || 0)} className="w-full input" />
                </div>
              </div>

              {/* Colonne 3 */}
              <div className="flex flex-col space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-4"><Upload className="h-5 w-5"/><h2 className="font-medium">Collection personnelle (optionnel)</h2></div>
                  <p className="text-sm muted">Importez des fichiers. L'IA tentera d'inclure les cartes pertinentes.</p>
                  <div className="mt-3"><FileDrop onFiles={async (files)=>{ for(const f of files){ await handleCollectionFile(f); } }}/></div>
                  <div className="mt-3 text-sm">{uploadedFiles.length>0 ? (<div className="space-y-2"><div className="muted text-xs">Fichiers importés ({uploadedFiles.length}) :</div><ul className="grid grid-cols-1 gap-2">{uploadedFiles.map(f=> (<li key={f.id} className="flex items-center justify-between glass-strong rounded-lg px-3 py-1.5"><span className="truncate" title={f.name}>{f.name}</span><button className="btn p-1.5" onClick={()=>removeUploadedFile(f.id)} title="Supprimer ce fichier"><Trash2 className="h-4 w-4"/></button></li>))}</ul></div>) : (<div className="muted">Aucun fichier importé.</div>)}</div>
                  <div className="flex items-center justify-between mt-3"><p>Cartes reconnues: <span className="font-semibold">{ownedMap.size}</span></p><button className="btn" onClick={clearCollection}>Réinitialiser</button></div>
                </div>
              </div>
            </div>

            {/* Actions principales */}
            <hr className="my-6 border-white/20" />
            <button className="w-full btn-primary justify-center" disabled={generationProgress.active} onClick={generate}>{generationProgress.active ? (<RefreshCcw className="h-4 w-4 animate-spin"/>):(<Shuffle className="h-4 w-4"/>)} {generationProgress.active ?"Génération par l'IA...":"Générer un deck avec l'IA"}</button>
            {error && <p className="text-sm mt-3 text-center" style={{color:'#ffb4c2'}}>{error}</p>}
            <div className="text-xs muted flex items-start gap-2 mt-3"><Info className="h-4 w-4 mt-0.5 flex-shrink-0"/><p>Le deck est généré par une IA. Le budget et les mécaniques sont des instructions, le résultat peut varier. La liste finale respecte les règles EDH (100 cartes, singleton, identité).</p></div>
          </div>

          {/* Colonne des résultats */}
          {deck && (
            <div className="space-y-8">
              <div className="glass p-6">
                <h3 className="font-medium mb-3">Cibles d’équilibrage (pour affichage)</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  {["ramp","draw","removal","wraths"].map(cat=> (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-28 capitalize">{cat}</span>
                      <label className="text-xs muted">Min</label>
                      <input type="number" className="w-16 input px-2 py-1" value={targets[cat].min} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], min:Number(e.target.value)||0}}))}/>
                      <label className="text-xs muted">Max</label>
                      <input type="number" className="w-16 input px-2 py-1" value={targets[cat].max} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], max:Number(e.target.value)||0}}))}/>
                    </div>
                  ))}
                </div>
                <p className="text-xs muted mt-2">Ces valeurs ne sont utilisées que pour le suivi visuel du deck généré par l'IA.</p>
              </div>
              <div className="glass p-6" ref={commanderSectionRef}>
                <div className="flex items-center gap-2 mb-4"><Sparkles className="h-5 w-5"/><h2 className="font-medium">Résultat</h2></div>
                <div className="space-y-6">
                  {/* Section Statistiques */}
                  <div className="glass-strong rounded-xl p-4">
                    <h3 className="font-medium mb-3">Statistiques</h3>
                    <div className="space-y-3">
                      {stats ? (
                        <div className="grid md:grid-cols-3 gap-3 text-sm">
                          <div className="glass rounded-lg p-3"><div className="muted text-xs">Cartes possédées</div><div className="text-lg font-semibold">{stats.ownedCount} / {deckSize} <span className="text-xs muted">({stats.ownedPct}%)</span></div></div>
                          <div className="glass rounded-lg p-3"><div className="muted text-xs">Coût estimé</div><div className="text-lg font-semibold">{(deck.spent||0).toFixed(2)}€</div></div>
                          <div className="glass rounded-lg p-3"><div className="muted text-xs">CMC moyen</div><div className="text-lg font-semibold">{stats.avgCmc}</div></div>
                          <div className="md:col-span-3 grid md:grid-cols-4 gap-2">{Object.entries(stats.typeCounts).map(([k,v])=> (<div key={k} className="glass rounded-lg p-3 flex items-center justify-between"><span className="muted text-xs">{k}</span><span className="font-medium">{v}</span></div>))}</div>
                        </div>
                      ) : (<div className="muted text-sm">Aucune statistique.</div>)}

                      <div className="glass rounded-lg p-3 text-sm space-y-1">
                        <p><span className="muted">Identité:</span> {deck.colorIdentity || "(Colorless)"} • <span className="muted">Taille:</span> {deckSize} cartes • <span className="muted">Budget:</span> {deck.budget ? `${deck.budget}€` : 'Aucun'}</p>
                        {deck.commandersFull.map(c => {
                          const extraInfo = commandersExtraInfo[c.name];
                          if (extraInfo && extraInfo.deckCount) {
                            return <p key={c.name} className="text-xs muted"><b>{c.name}</b> est joué dans {extraInfo.deckCount.toLocaleString('fr-FR')} decks (EDHREC).</p>
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Section Commandant */}
                  <div>
                    <h3 className="text-lg font-medium">Commandant{deck.commanders.length>1?'s':''} ({deck.commanders.length})</h3>
                    <div className="mt-2 grid md:grid-cols-2 gap-3">
                      {deck.commandersFull?.map((c,i)=> {
                        const owned = isOwned(c.name);
                        return (
                          <CardTile key={i} card={c} owned={owned} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}} isWinCon={specialCards.winCons.has(c.name)} isGameChanger={specialCards.gameChangers.has(c.name)} />
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4"><Progress label="Ramp" value={deck.balanceCounts?.ramp||0} targetMin={targets.ramp.min} targetMax={targets.ramp.max}/><Progress label="Pioche" value={deck.balanceCounts?.draw||0} targetMin={targets.draw.min} targetMax={targets.draw.max}/><Progress label="Anti-bêtes / Answers" value={deck.balanceCounts?.removal||0} targetMin={targets.removal.min} targetMax={targets.removal.max}/><Progress label="Wraths" value={deck.balanceCounts?.wraths||0} targetMin={targets.wraths.min} targetMax={targets.wraths.max}/></div>
                  <div><h3 className="text-lg font-medium">Sorts non-terrains ({Object.values(deck.nonlands).reduce((a,b)=>a+b,0)})</h3><div className="space-y-4 mt-2">{Object.entries(nonlandsByType).map(([label, cards])=> (<div key={label}><h4 className="text-sm muted mb-2">{label} ({cards.length})</h4><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{cards.map((c,idx)=> (<CardTile key={c.name+idx} card={c} owned={isOwned(c.name)} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}} isWinCon={specialCards.winCons.has(c.name)} isGameChanger={specialCards.gameChangers.has(c.name)}/>))}</div></div>))}</div></div>
                  <div><h3 className="text-lg font-medium">Terrains ({Object.values(deck.lands).reduce((a,b)=>a+b,0)})</h3><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">{deck.landCards.map((lc,idx)=> (<CardTile key={lc.name+idx} card={lc} qty={lc.qty} owned={isOwned(lc.name)} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>))}</div></div>
                  <div className="grid grid-cols-1 lg:flex lg:flex-wrap lg:gap-2 gap-2"><button className="btn" onClick={copyList}><Copy className="inline-block h-4 w-4"/>Copier</button><button className="btn" onClick={exportJson}><Download className="inline-block h-4 w-4"/>JSON</button><button className="btn-primary" onClick={exportTxt}><Download className="inline-block h-4 w-4"/>TXT</button><button className="btn" onClick={reequilibrer}><Sparkles className="inline-block h-4 w-4"/>Rééquilibrer (Bientôt !)</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
        <CardModal open={showModal} card={modalCard} owned={modalOwned} onClose={() => setShowModal(false)} />
        <footer className="mt-10 text-xs muted">Fait avec ❤️ — Scryfall API. L'IA est propulsée par Google Gemini. Non affilié à WotC.</footer>
      </div>
    </div>
  );
}
