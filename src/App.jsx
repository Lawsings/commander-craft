import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Settings2, Info, Sparkles, Trash2, Sun, Moon } from "lucide-react";

// Import des modules séparés
import './index.css';
import {
  MECHANIC_TAGS, RE, sleep, ciMask, identityToQuery, nameOf, oracle,
  isCommanderLegal, getCI, unionCI, priceEUR, edhrecScore, distinctByName,
  sf, bundleCard, bundleByName, primaryTypeLabel, parseCollectionFile,
  fetchCommanderDeckCount, WIN_CONDITIONS, GAME_CHANGERS
} from './utils.js';
import { useCommanderResolution } from './hooks.js';
import ManaCost from './components/ManaCost.jsx';
import CommanderAutocomplete from './components/CommanderAutocomplete.jsx';
import FileDrop from './components/FileDrop.jsx';
import Progress from './components/Progress.jsx';
import CardTile from './components/CardTile.jsx';
import CardModal from './components/CardModal.jsx';

// Nouveau composant pour la modale de progression
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
  const [allowPartner, setAllowPartner] = useState(true);
  const [allowBackground, setAllowBackground] = useState(true);
  const [desiredCI, setDesiredCI] = useState("");
  const [targetLands, setTargetLands] = useState(37);
  const [deckBudget, setDeckBudget] = useState(50);
  const [mechanics, setMechanics] = useState([]);
  const [limitNotice, setLimitNotice] = useState("");
  const [weightOwned, setWeightOwned] = useState(1.0);
  const [weightEdhrec, setWeightEdhrec] = useState(1.0);
  const [targets, setTargets] = useState({ ramp: { min: 10, max: 12 }, draw: { min: 9, max: 12 }, removal: { min: 8, max: 10 }, wraths: { min: 3, max: 5 } });
  const [ownedMap, setOwnedMap] = useState(new Map());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalOwned, setModalOwned] = useState(false);
  const [commandersExtraInfo, setCommandersExtraInfo] = useState({});
  const [specialCards, setSpecialCards] = useState({ winCons: new Set(), gameChangers: new Set() });
  const [generationProgress, setGenerationProgress] = useState({ active: false, step: '', percent: 0 });
  const [isRebalancing, setIsRebalancing] = useState(false);

  const commanderSectionRef = useRef(null);
  const IDENTITY_COLOR_ORDER = ['W', 'B', 'U', 'G', 'R'];

  const selectedCommanderCard = useCommanderResolution(commanderMode, chosenCommander, setDesiredCI, setError);
  const toggleMechanic = (key) => setMechanics(prev => prev.includes(key) ? prev.filter(k => k !== key) : (prev.length >= 3 ? (setLimitNotice("Maximum 3 mécaniques à la fois"), setTimeout(() => setLimitNotice(""), 1500), prev) : [...prev, key]));

  // Logique de génération
  const mechanicScore = (card) => mechanics.length ? MECHANIC_TAGS.reduce((s, m) => s + (mechanics.includes(m.key) && m.matchers.some(k => oracle(card).includes(k.toLowerCase())) ? 1 : 0), 0) : 0;
  const sortByPreference = (pool) => { const rb = new Map(pool.map(c => [nameOf(c), Math.random()])); return [...pool].sort((a, b) => { const owA = ownedMap.has(nameOf(a).toLowerCase()) ? 1 : 0, owB = ownedMap.has(nameOf(b).toLowerCase()) ? 1 : 0; const sa = weightOwned * owA + weightEdhrec * edhrecScore(a) + 0.25 * mechanicScore(a); const sb = weightOwned * owB + weightEdhrec * edhrecScore(b) + 0.25 * mechanicScore(b); if (sa !== sb) return sb - sa; const pA = priceEUR(a), pB = priceEUR(b); return pA !== pB ? pA - pB : rb.get(nameOf(a)) - rb.get(nameOf(b)); }); };
  const greedyPickUnique = (sortedPool, need, banned, currentCost, budget) => { const picks = []; const taken = new Set(banned); let cost = currentCost; for (const c of sortedPool) { if (picks.length >= need) break; const n = nameOf(c); if (taken.has(n)) continue; const p = priceEUR(c); if (budget > 0 && (cost + p) > budget) continue; picks.push(c); taken.add(n); cost += p; } return { picks, cost }; };
  const buildManaBase = (ci, basicTarget) => { const colors = (ci || "").split(""); const basicsByColor = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" }; if (colors.length === 0) return { Wastes: basicTarget }; const per = Math.floor(basicTarget / colors.length); let rem = basicTarget - per * colors.length; const lands = {}; for (const c of colors) { const n = basicsByColor[c]; lands[n] = per + (rem > 0 ? 1 : 0); rem--; } return lands; };
  const countCats = (cards) => cards.reduce((a, c) => ({ ramp: a.ramp + (RE.RAMP.test(oracle(c)) || ((c.type_line || '').toLowerCase().includes('artifact') && oracle(c).includes('add one mana')) ? 1 : 0), draw: a.draw + (RE.DRAW.test(oracle(c)) ? 1 : 0), removal: a.removal + (RE.REMOVAL.test(oracle(c)) ? 1 : 0), wraths: a.wraths + (RE.WRATHS.test(oracle(c)) ? 1 : 0) }), { ramp: 0, draw: 0, removal: 0, wraths: 0 });
  const balanceSpells = (picks, pool, budget, spent) => { const TARGETS = { ramp: targets.ramp.min, draw: targets.draw.min, removal: targets.removal.min, wraths: targets.wraths.min }; const byName = new Set(picks.map(nameOf)); const counts = countCats(picks); const sorted = sortByPreference(pool); const fits = (cat, c) => (cat === 'ramp' && RE.RAMP.test(oracle(c))) || (cat === 'draw' && RE.DRAW.test(oracle(c))) || (cat === 'removal' && RE.REMOVAL.test(oracle(c))) || (cat === 'wraths' && RE.WRATHS.test(oracle(c))); const res = [...picks]; for (const cat of Object.keys(TARGETS)) { if (counts[cat] >= TARGETS[cat]) continue; for (const c of sorted) { const n = nameOf(c); if (byName.has(n)) continue; const p = priceEUR(c); if (budget > 0 && (spent + p) > budget) continue; if (!fits(cat, c)) continue; const idx = res.findIndex(x => !fits(cat, x)); if (idx >= 0) { byName.delete(nameOf(res[idx])); res[idx] = c; byName.add(n); counts[cat]++; spent += p; } if (counts[cat] >= TARGETS[cat]) break; } } return { picks: res, spent, targets: TARGETS, counts }; };
  const pickCommander = async (ci) => { if (commanderMode === 'select' && selectedCommanderCard) return selectedCommanderCard; const q = ["legal:commander", "is:commander", "game:paper", "-is:funny", ci ? identityToQuery(ci) : "", "(type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background)"].filter(Boolean).join(" "); for (let i = 0; i < 6; i++) { const c = await sf.random(q); if (!isCommanderLegal(c)) continue; if (oracle(c).includes("companion")) continue; return c; } throw new Error("Impossible de trouver un commandant aléatoire conforme."); };
  const maybeAddPartner = async (primary) => { const has = (oracle(primary).includes("partner") || (primary.keywords || []).some(k => k.toLowerCase().includes("partner"))); if (!allowPartner || !has) return null; const q = ["legal:commander", "is:commander", "game:paper", "-is:funny", "(keyword:partner or o:\"Partner with\")"].join(" "); for (let i = 0; i < 12; i++) { const c = await sf.random(q); if (!isCommanderLegal(c)) continue; if (nameOf(c) === nameOf(primary)) continue; return c; } return null; };
  const maybeAddBackground = async (primary) => { const wants = allowBackground && oracle(primary).includes("choose a background"); if (!wants) return null; const q = ["legal:commander", "type:background", "game:paper", identityToQuery(getCI(primary) || "wubrg")].join(" "); for (let i = 0; i < 10; i++) { const c = await sf.random(q); if (!isCommanderLegal(c)) continue; return c; } return null; };

  const fetchPool = async (ci) => {
    const base = `legal:commander game:paper ${identityToQuery(ci)} -is:funny`;
    const mech = mechanics.length ? ` (${mechanics.map(k => { const tag = MECHANIC_TAGS.find(m => m.key === k); if (!tag) return ""; const parts = tag.matchers.map(m => `o:\"${m}\"`).join(" or "); return `(${parts})`; }).join(" or ")})` : "";
    const spellsQ = `${base} -type:land -type:background${mech}`;
    const landsQ = `${base} type:land -type:basic`;
    const gather = async (q, b, pages = 2) => {
      try {
        let page = await sf.search(q, { unique: "cards", order: "edhrec" });
        if (page && page.data) {
          b.push(...page.data);
          for (let i = 1; i < pages && page.has_more; i++) {
            await sleep(100);
            const nextPageResponse = await fetch(page.next_page);
            if (nextPageResponse.ok) {
              page = await nextPageResponse.json();
              if (page && page.data) {
                b.push(...page.data);
              }
            } else {
              break;
            }
          }
        }
      } catch (error) {
        if (!error.message.includes("404")) {
          console.error("Scryfall API error during gather:", error);
          throw error;
        }
      }
    };

    const spells = [], lands = [];
    await gather(spellsQ, spells, 2);
    await gather(landsQ, lands, 1);
    return { spells: distinctByName(spells).filter(isCommanderLegal), lands: distinctByName(lands).filter(isCommanderLegal) };
  };

  async function buildLandCards(landsMap) { const out = []; for (const [n, q] of Object.entries(landsMap)) { try { const b = await bundleByName(n); out.push({ ...b, qty: q }); } catch { out.push({ name: n, qty: q, image: "", small: "", oracle_en: "", mana_cost: "", cmc: 0, prices: {}, scryfall_uri: "" }); } await sleep(60); } return out; }

  const identifySpecialCards = (cards) => {
    const winCons = new Set();
    const gameChangers = new Set();
    cards.forEach(card => {
      const cardName = nameOf(card).toLowerCase();
      if (WIN_CONDITIONS.has(cardName)) {
        winCons.add(nameOf(card));
      }
      if (GAME_CHANGERS.has(cardName) || RE.WRATHS.test(oracle(card))) {
        gameChangers.add(nameOf(card));
      }
    });
    setSpecialCards({ winCons, gameChangers });
  };

  const generate = async () => {
    setError(""); setDeck(null); setCommandersExtraInfo({}); setSpecialCards({ winCons: new Set(), gameChangers: new Set() });
    setGenerationProgress({ active: true, step: 'Initialisation...', percent: 0 });

    try {
      setGenerationProgress({ active: true, step: 'Sélection du commandant...', percent: 10 });
      const primary = await pickCommander(commanderMode === 'random' ? desiredCI : getCI(selectedCommanderCard));
      let cmdrs = [primary]; const partner = await maybeAddPartner(primary); const background = await maybeAddBackground(primary); if (partner) cmdrs.push(partner); else if (background) cmdrs.push(background);
      let ci = getCI(primary); if (cmdrs.length > 1) for (const c of cmdrs) ci = unionCI(ci, getCI(c));

      const commandersFull = cmdrs.map(bundleCard);

      const extraInfoPromises = commandersFull.map(c => fetchCommanderDeckCount(c.name));
      Promise.all(extraInfoPromises).then(results => {
          const newExtraInfo = {};
          commandersFull.forEach((c, index) => { newExtraInfo[c.name] = { deckCount: results[index] }; });
          setCommandersExtraInfo(newExtraInfo);
      });

      setGenerationProgress({ active: true, step: 'Recherche des cartes...', percent: 40 });
      const pool = await fetchPool(ci);

      // MODIFICATION: Vérifie si le pool de sorts est suffisant
      const landsTarget = Math.max(32, Math.min(40, targetLands));
      const spellsTarget = 100 - cmdrs.length - landsTarget;
      if (pool.spells.length < spellsTarget) {
        throw new Error("Pas assez de cartes trouvées pour construire un deck. Essayez des paramètres moins restrictifs.");
      }

      const totalBudget = Number(deckBudget) || 0; let spent = cmdrs.reduce((s, c) => s + priceEUR(c), 0); if (totalBudget > 0 && spent > totalBudget) throw new Error(`Le budget (${totalBudget.toFixed(2)}€) est déjà dépassé par le coût des commandants (${spent.toFixed(2)}€).`);

      setGenerationProgress({ active: true, step: 'Sélection des sorts...', percent: 60 });
      const spellsPref = sortByPreference(pool.spells); const landsPref = sortByPreference(pool.lands);
      const banned = new Set(cmdrs.map(nameOf)); let { picks: pickedSpells, cost: costAfterSpells } = greedyPickUnique(spellsPref, spellsTarget, banned, spent, totalBudget); spent = costAfterSpells;

      setGenerationProgress({ active: true, step: 'Équilibrage du deck...', percent: 75 });
      const balanced = balanceSpells(pickedSpells, pool.spells, totalBudget, spent); pickedSpells = balanced.picks; spent = balanced.spent;

      setGenerationProgress({ active: true, step: 'Construction de la base de mana...', percent: 90 });
      const basicsNeeded = Math.max(landsTarget - Math.min(8, landsPref.length), 0); const landsMap = buildManaBase(ci, basicsNeeded); const chosenNonbasics = []; for (const nb of landsPref) { if (chosenNonbasics.length >= 8) break; const p = priceEUR(nb); if (totalBudget > 0 && (spent + p) > totalBudget) continue; chosenNonbasics.push(nb); spent += p; } for (const nb of chosenNonbasics) { landsMap[nameOf(nb)] = (landsMap[nameOf(nb)] || 0) + 1; }
      const currentCount = cmdrs.length + pickedSpells.length + Object.values(landsMap).reduce((a, b) => a + b, 0); let missing = 100 - currentCount; const basicsByColor = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" }; const firstBasic = (ci.split("")[0] && basicsByColor[ci.split("")[0]]) || "Wastes"; while (missing > 0) { landsMap[firstBasic] = (landsMap[firstBasic] || 0) + 1; missing--; }

      const nonlandCards = pickedSpells.map(bundleCard);
      const landCards = await buildLandCards(landsMap);

      identifySpecialCards([...commandersFull, ...nonlandCards]);

      setGenerationProgress({ active: true, step: 'Finalisation...', percent: 100 });
      await sleep(500);

      setDeck({
        colorIdentity: ci,
        commanders: cmdrs.map(nameOf), commandersFull,
        nonlands: Object.fromEntries(pickedSpells.map(c => [nameOf(c), 1])),
        nonlandCards,
        lands: landsMap, landCards,
        budget: totalBudget, spent: Number(spent.toFixed(2)), balanceTargets: targets, balanceCounts: countCats(pickedSpells)
      });
    } catch (e) { setError(e.message || String(e)); } finally {
      setGenerationProgress({ active: false, step: '', percent: 0 });
    }
  };

  useEffect(() => {
    if (deck && commanderSectionRef.current) {
      commanderSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [deck]);

  const download = (filename, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); };
  const mtgoExport = (deck) => { const lines = []; deck.commanders.forEach(c => lines.push(`1 ${c}`)); Object.entries(deck.nonlands).forEach(([n, q]) => lines.push(`${q} ${n}`)); Object.entries(deck.lands).forEach(([n, q]) => lines.push(`${q} ${n}`)); return lines.join("\n"); };
  const exportTxt = () => { if (deck) download("commander-deck.txt", mtgoExport(deck)); };
  const exportJson = () => { if (deck) download("commander-deck.json", JSON.stringify(deck, null, 2)); };
  const copyList = () => { if (!deck) return; const lines = [`// CI: ${deck.colorIdentity || "(Colorless)"} • Budget: ${deck.budget || 0}€ • Coût estimé: ${deck.spent || 0}€`, ...deck.commanders.map(c => `1 ${c} // Commander`), ...Object.entries(deck.nonlands).map(([n, q]) => `${q} ${n}`), ...Object.entries(deck.lands).map(([n, q]) => `${q} ${n}`)]; navigator.clipboard.writeText(lines.join("\n")); };

  const handleCollectionFile = async (f) => { if (!f) return; const parsed = await parseCollectionFile(f); const entry = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: f.name, map: parsed }; setUploadedFiles(prev => { const next = [...prev, entry]; const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; }); };
  const removeUploadedFile = (id) => setUploadedFiles(prev => { const next = prev.filter(x => x.id !== id); const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; });
  const clearCollection = () => { setOwnedMap(new Map()); setUploadedFiles([]); };

  const reequilibrer = async () => { if (!deck) return; try { setIsRebalancing(true); const ci = deck.colorIdentity; const base = `legal:commander game:paper ${identityToQuery(ci)} -is:funny -type:land -type:background`; let page = await sf.search(base, { unique: "cards", order: "edhrec" }); let pool = page.data; if (page.has_more) { const next = await fetch(page.next_page).then(r => r.json()); pool = pool.concat(next.data || []); } pool = distinctByName(pool).filter(isCommanderLegal); const currentNames = new Set(Object.keys(deck.nonlands)); const currentObjs = pool.filter(c => currentNames.has(nameOf(c))); const others = pool.filter(c => !currentNames.has(nameOf(c))); const totalBudget = deck.budget || 0; let spent = 0; const balanced = balanceSpells(currentObjs, others, totalBudget, spent); const newNonlands = Object.fromEntries(balanced.picks.map(c => [nameOf(c), 1])); const newNonlandCards = balanced.picks.map(bundleCard); setDeck(prev => ({ ...prev, nonlands: newNonlands, nonlandCards: newNonlandCards, balanceCounts: balanced.counts, balanceTargets: targets })); } finally { setIsRebalancing(false); } };

  const deckSize = useMemo(() => { if (!deck) return 0; const cmd = deck.commanders?.length || 0; const nl = Object.values(deck?.nonlands || {}).reduce((a, b) => a + b, 0); const ld = Object.values(deck?.lands || {}).reduce((a, b) => a + b, 0); return cmd + nl + ld; }, [deck]);
  const nonlandsByType = useMemo(() => { if (!deck?.nonlandCards) return {}; const groups = {}; for (const c of deck.nonlandCards) { const k = primaryTypeLabel(c.type_line); (groups[k] ||= []).push(c); } const order = ["Créatures", "Artefacts", "Enchantements", "Éphémères", "Rituels", "Planeswalkers", "Batailles", "Autres"]; const sorted = {}; for (const k of order) { if (groups[k]) sorted[k] = groups[k]; } return sorted; }, [deck]);
  const isOwned = (cardName) => ownedMap.has((cardName || "").toLowerCase());
  const stats = useMemo(() => {
    if (!deck) return null;
    const own = new Map(ownedMap);
    const take = (name, need) => { const k = name.toLowerCase(); const have = own.get(k) || 0; const used = Math.min(have, need); if (used > 0) own.set(k, have - used); return used; };
    let ownedCount = 0;
    (deck.commanders || []).forEach(n => ownedCount += take(n, 1));
    Object.entries(deck.nonlands || {}).forEach(([n, q]) => ownedCount += take(n, q));
    Object.entries(deck.lands || {}).forEach(([n, q]) => ownedCount += take(n, q));
    const total = deckSize;
    const ownedPct = total ? Math.round((ownedCount / total) * 100) : 0;
    const cmcCards = [...(deck.commandersFull || []), ...(deck.nonlandCards || [])];
    const cmcVals = cmcCards.map(c => Number(c.cmc) || 0);
    const avgCmc = cmcVals.length ? (cmcVals.reduce((a, b) => a + b, 0) / cmcVals.length) : 0;
    const typeCounts = Object.fromEntries(Object.entries(nonlandsByType).map(([k, arr]) => [k, arr.length]));
    return { ownedCount, ownedPct, avgCmc: Number(avgCmc.toFixed(2)), typeCounts };
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
                <div className="space-y-3">
                  <div>
                    <label className="muted text-sm">Prioriser ma collection: {weightOwned.toFixed(1)}x</label>
                    <input type="range" min={0} max={2} step={0.1} value={weightOwned} onChange={e => setWeightOwned(Number(e.target.value))} className="w-full" />
                    <p className="text-xs muted mt-1">Donne plus de poids aux cartes que vous possédez déjà.</p>
                  </div>
                  <div>
                    <label className="muted text-sm">Prioriser EDHREC: {weightEdhrec.toFixed(1)}x</label>
                    <input type="range" min={0} max={2} step={0.1} value={weightEdhrec} onChange={e => setWeightEdhrec(Number(e.target.value))} className="w-full" />
                    <p className="text-xs muted mt-1">Privilégie les cartes populaires et synergiques selon EDHREC.</p>
                  </div>
                </div>
                <div><label className="muted text-sm">Nombre de terrains visé: {targetLands}</label><input type="range" min={32} max={40} step={1} value={targetLands} onChange={e => setTargetLands(Number(e.target.value))} className="w-full" /></div>
                <div>
                  <label className="muted text-sm">Budget global du deck (EUR)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0 = sans limite" value={deckBudget || ''} onChange={e => setDeckBudget(Number(e.target.value.replace(/\D/g,'')) || 0)} className="w-full input" />
                </div>
                <div className="flex items-center justify-between"><div className="space-y-1"><span>Autoriser Partner</span><p className="text-xs muted">N'influence pas la recherche ; ajoute un partenaire si possible.</p></div><input type="checkbox" checked={allowPartner} onChange={e => setAllowPartner(e.target.checked)} /></div>
                <div className="flex items-center justify-between"><div className="space-y-1"><span>Autoriser Background</span><p className="text-xs muted">Si le commandant le permet.</p></div><input type="checkbox" checked={allowBackground} onChange={e => setAllowBackground(e.target.checked)} /></div>
              </div>

              {/* Colonne 3 */}
              <div className="flex flex-col space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-4"><Upload className="h-5 w-5"/><h2 className="font-medium">Collection personnelle (optionnel)</h2></div>
                  <p className="text-sm muted">Importe un ou plusieurs fichiers pour prioriser tes cartes lors de la génération.</p>
                  <div className="mt-3"><FileDrop onFiles={async (files)=>{ for(const f of files){ await handleCollectionFile(f); } }}/></div>
                  <div className="mt-3 text-sm">{uploadedFiles.length>0 ? (<div className="space-y-2"><div className="muted text-xs">Fichiers importés ({uploadedFiles.length}) :</div><ul className="grid grid-cols-1 gap-2">{uploadedFiles.map(f=> (<li key={f.id} className="flex items-center justify-between glass-strong rounded-lg px-3 py-1.5"><span className="truncate" title={f.name}>{f.name}</span><button className="btn p-1.5" onClick={()=>removeUploadedFile(f.id)} title="Supprimer ce fichier"><Trash2 className="h-4 w-4"/></button></li>))}</ul></div>) : (<div className="muted">Aucun fichier importé pour l’instant.</div>)}</div>
                  <div className="flex items-center justify-between mt-3"><p>Cartes reconnues: <span className="font-semibold">{ownedMap.size}</span></p><button className="btn" onClick={clearCollection}>Réinitialiser</button></div>
                </div>
              </div>
            </div>

            {/* Actions principales */}
            <hr className="my-6 border-white/20" />
            <button className="w-full btn-primary justify-center" disabled={generationProgress.active} onClick={generate}>{generationProgress.active ? (<RefreshCcw className="h-4 w-4 animate-spin"/>):(<Shuffle className="h-4 w-4"/>)} {generationProgress.active ?"Génération...":"Générer un deck"}</button>
            {error && <p className="text-sm mt-3 text-center" style={{color:'#ffb4c2'}}>{error}</p>}
            <div className="text-xs muted flex items-start gap-2 mt-3"><Info className="h-4 w-4 mt-0.5 flex-shrink-0"/><p>Règles EDH respectées (100 cartes, singleton sauf bases, identité couleur, légalités). Budget heuristique glouton.</p></div>
          </div>

          {/* Colonne des résultats */}
          <div className="space-y-8">
            <div className="glass p-6">
              <h3 className="font-medium mb-3">Cibles d’équilibrage (éditables)</h3>
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
              <p className="text-xs muted mt-2">L’algo vise le <b>min</b> comme plancher; le max est indicatif pour l’affichage.</p>
            </div>
            <div className="glass p-6" ref={commanderSectionRef}>
              <div className="flex items-center gap-2 mb-4"><Sparkles className="h-5 w-5"/><h2 className="font-medium">Résultat</h2></div>
              {!deck ? (<div className="text-sm muted">Configure les options puis clique « Générer un deck ».</div>) : (
                <div className="space-y-6">
                  {/* Section Statistiques (déplacée en haut) */}
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

                      {/* Infos générales et popularité du commandant */}
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
                  <div className="section-anchor">
                    <h3 className="text-lg font-medium">Commandant{deck.commanders.length>1?'s':''} ({deck.commanders.length})</h3>
                    <div className="mt-2 grid md:grid-cols-2 gap-3">
                      {deck.commandersFull?.map((c,i)=> {
                        const owned = isOwned(c.name);
                        return (
                          <CardTile
                            key={i}
                            card={c}
                            owned={owned}
                            onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}
                            isWinCon={specialCards.winCons.has(c.name)}
                            isGameChanger={specialCards.gameChangers.has(c.name)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4"><Progress label="Ramp" value={deck.balanceCounts?.ramp||0} targetMin={targets.ramp.min} targetMax={targets.ramp.max}/><Progress label="Pioche" value={deck.balanceCounts?.draw||0} targetMin={targets.draw.min} targetMax={targets.draw.max}/><Progress label="Anti-bêtes / Answers" value={deck.balanceCounts?.removal||0} targetMin={targets.removal.min} targetMax={targets.removal.max}/><Progress label="Wraths" value={deck.balanceCounts?.wraths||0} targetMin={targets.wraths.min} targetMax={targets.wraths.max}/></div>
                  <div><h3 className="text-lg font-medium">Sorts non-terrains ({Object.values(deck.nonlands).reduce((a,b)=>a+b,0)})</h3>{Object.keys(nonlandsByType).length===0 ? (<p className="text-sm muted mt-1">Aucun sort détecté.</p>) : (<div className="space-y-4 mt-2">{Object.entries(nonlandsByType).map(([label, cards])=> (<div key={label}><h4 className="text-sm muted mb-2">{label} ({cards.length})</h4><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{cards.map((c,idx)=> { const owned = isOwned(c.name); return (<CardTile key={c.name+idx} card={c} owned={owned} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}} isWinCon={specialCards.winCons.has(c.name)} isGameChanger={specialCards.gameChangers.has(c.name)}/>); })}</div></div>))}</div>)}</div>
                  <div><h3 className="text-lg font-medium">Terrains ({Object.values(deck.lands).reduce((a,b)=>a+b,0)})</h3>{Array.isArray(deck.landCards) && deck.landCards.length>0 ? (<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">{deck.landCards.map((lc,idx)=> { const owned = isOwned(lc.name); return (<CardTile key={lc.name+idx} card={lc} qty={lc.qty} owned={owned} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>); })}</div>) : (<div className="grid md:grid-cols-2 gap-2 mt-2 text-sm">{Object.entries(deck.lands).map(([n,q]) => (<div key={n} className="flex justify-between glass-strong rounded-lg px-3 py-1.5"><span>{n}</span><span className="muted">x{q}</span></div>))}</div>)}</div>
                  <div className="grid grid-cols-1 lg:flex lg:flex-wrap lg:gap-2 gap-2"><button className="btn" onClick={copyList}><Copy className="inline-block h-4 w-4"/>Copier</button><button className="btn" onClick={exportJson}><Download className="inline-block h-4 w-4"/>JSON</button><button className="btn-primary" onClick={exportTxt}><Download className="inline-block h-4 w-4"/>TXT</button><button className="btn" onClick={reequilibrer} disabled={isRebalancing}><Sparkles className="inline-block h-4 w-4"/>Rééquilibrer</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
        <CardModal open={showModal} card={modalCard} owned={modalOwned} onClose={() => setShowModal(false)} />
        <footer className="mt-10 text-xs muted">Fait avec ❤️ — Scryfall API (popularité EDHREC via <code>edhrec_rank</code>). Non affilié à WotC.</footer>
      </div>
    </div>
  );
}
