import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function StatusRow({ name, configured }) {
  return (
    <div className="flex items-center justify-between py-2">
      <p className="font-medium text-sm">{name}</p>
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${
          configured ? "bg-emerald-900 text-emerald-200" : "bg-slate-700 text-slate-400"
        }`}
      >
        {configured ? "Configuré" : "Non configuré"}
      </span>
    </div>
  );
}

function TestResultBadge({ result }) {
  if (!result) return null;
  if (result === "loading") return <span className="text-xs text-slate-400">Test en cours...</span>;
  return (
    <span className={`text-xs ${result.valid ? "text-emerald-400" : "text-red-400"}`}>
      {result.valid ? `✓ ${result.message || "Valide"}` : `✗ ${result.message || "Invalide"}`}
    </span>
  );
}

const CATEGORIES = [
  { id: "general", label: "Général" },
  { id: "metadata", label: "Métadonnées" },
  { id: "downloads", label: "Téléchargements" },
  { id: "integrations", label: "Intégrations" },
];

const SECTIONS = [
  {
    id: "stockage",
    category: "general",
    title: "Stockage",
    fields: [
      {
        key: "LIBRARY_SUBPATH",
        label: "Dossier de la bibliothèque (relatif au montage /data)",
        type: "text",
        placeholder: "media/games",
      },
      {
        key: "DOWNLOADS_SUBPATH",
        label: "Dossier de téléchargement qBittorrent (relatif au montage /data)",
        type: "text",
        placeholder: "torrents/games",
      },
    ],
  },
  {
    id: "database",
    category: "general",
    title: "Base de données",
    fields: [
      {
        key: "DB_FILENAME",
        label: "Fichier de base de données (relatif au montage /config)",
        type: "text",
        placeholder: "gamarr.db",
      },
    ],
  },
  {
    id: "igdb",
    category: "metadata",
    title: "IGDB",
    fields: [
      { key: "IGDB_CLIENT_ID", label: "Client ID", type: "text" },
      { key: "IGDB_CLIENT_SECRET", label: "Client Secret", type: "password" },
    ],
  },
  {
    id: "rawg",
    category: "metadata",
    title: "RAWG",
    fields: [{ key: "RAWG_API_KEY", label: "Clé API", type: "password" }],
  },
  {
    id: "prowlarr",
    category: "downloads",
    title: "Prowlarr",
    fields: [
      { key: "PROWLARR_URL", label: "URL", type: "text", placeholder: "https://..." },
      { key: "PROWLARR_API_KEY", label: "Clé API", type: "password" },
      {
        key: "PROWLARR_PREFERRED_TERMS",
        label: "Groupes/mots-clés préférés",
        type: "text",
        placeholder: "FitGirl, DODI (séparés par des virgules)",
      },
      {
        key: "PROWLARR_BLOCKED_TERMS",
        label: "Groupes/mots-clés bloqués",
        type: "text",
        placeholder: "CPY, RELOADED (séparés par des virgules)",
      },
      {
        key: "AUTO_SEARCH_ENABLED",
        label: "Rechercher et télécharger automatiquement les jeux manquants",
        type: "checkbox",
      },
    ],
  },
  {
    id: "qbittorrent",
    category: "downloads",
    title: "qBittorrent",
    fields: [
      { key: "QBITTORRENT_URL", label: "URL du WebUI", type: "text", placeholder: "http://qbittorrent:8080" },
      { key: "QBITTORRENT_USERNAME", label: "Utilisateur", type: "text" },
      { key: "QBITTORRENT_PASSWORD", label: "Mot de passe", type: "password" },
    ],
  },
  {
    id: "steam",
    category: "integrations",
    title: "Steam",
    fields: [
      { key: "STEAM_API_KEY", label: "Clé API", type: "password", placeholder: "steamcommunity.com/dev/apikey" },
      { key: "STEAM_ID", label: "SteamID64", type: "text", placeholder: "76561198..." },
    ],
  },
];

export function SettingsView() {
  const [activeCategory, setActiveCategory] = useState("general");
  const [form, setForm] = useState(null);
  const [providers, setProviders] = useState([]);
  const [prowlarr, setProwlarr] = useState(null);
  const [steam, setSteam] = useState(null);
  const [qbittorrent, setQbittorrent] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [indexers, setIndexers] = useState(null);
  const [loadingIndexers, setLoadingIndexers] = useState(false);
  const [indexersError, setIndexersError] = useState(null);

  async function loadStatus() {
    try {
      const [p, pr, st, qb] = await Promise.all([
        api.listProviders(),
        api.prowlarrStatus(),
        api.steamStatus(),
        api.qbittorrentStatus(),
      ]);
      setProviders(p);
      setProwlarr(pr);
      setSteam(st);
      setQbittorrent(qb);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    api.getSettings().then(setForm).catch((err) => setError(err.message));
    loadStatus();
  }, []);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTest(sectionId) {
    setTestResults((prev) => ({ ...prev, [sectionId]: "loading" }));
    try {
      let result;
      if (sectionId === "stockage") {
        result = await api.testStorage(form.LIBRARY_SUBPATH, form.DOWNLOADS_SUBPATH);
      } else if (sectionId === "database") {
        result = await api.testDatabase(form.DB_FILENAME);
      } else if (sectionId === "rawg") {
        result = await api.testRawg(form.RAWG_API_KEY);
      } else if (sectionId === "igdb") {
        result = await api.testIgdb(form.IGDB_CLIENT_ID, form.IGDB_CLIENT_SECRET);
      } else if (sectionId === "steam") {
        result = await api.testSteam(form.STEAM_API_KEY, form.STEAM_ID);
      } else if (sectionId === "qbittorrent") {
        result = await api.testQbittorrent(
          form.QBITTORRENT_URL,
          form.QBITTORRENT_USERNAME,
          form.QBITTORRENT_PASSWORD
        );
      } else {
        result = await api.testProwlarr(form.PROWLARR_URL, form.PROWLARR_API_KEY);
      }
      setTestResults((prev) => ({ ...prev, [sectionId]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [sectionId]: { valid: false, message: err.message } }));
    }
  }

  async function handleLoadIndexers() {
    setLoadingIndexers(true);
    setIndexersError(null);
    try {
      const list = await api.listProwlarrIndexers(form.PROWLARR_URL, form.PROWLARR_API_KEY);
      setIndexers(list);
    } catch (err) {
      setIndexersError(err.message);
    } finally {
      setLoadingIndexers(false);
    }
  }

  function toggleIndexer(id) {
    setForm((prev) => {
      const current = prev.PROWLARR_INDEXER_IDS || [];
      const next = current.includes(id)
        ? current.filter((i) => i !== id)
        : [...current, id];
      return { ...prev, PROWLARR_INDEXER_IDS: next };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(false);
    try {
      const updated = await api.updateSettings(form);
      setForm(updated);
      setSavedMsg(true);
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-4">Intégrations</h2>

      {form?.firstRun && (
        <div className="bg-indigo-950 border border-indigo-800 rounded-lg p-4 mb-6">
          <p className="font-medium mb-1">Bienvenue sur Gamarr 👋</p>
          <p className="text-sm text-slate-300">
            Aucun fichier <code className="text-slate-400">config/secrets.json</code> n'a encore été
            créé. Renseigne au moins la clé API RAWG ci-dessous pour activer la recherche de
            métadonnées (gratuite sur{" "}
            <a href="https://rawg.io/apidocs" target="_blank" rel="noreferrer" className="underline">
              rawg.io/apidocs
            </a>
            ) — le reste (IGDB, Prowlarr) est optionnel et peut se faire plus tard.
          </p>
        </div>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-slate-900 rounded-lg p-4 mb-6 divide-y divide-slate-800">
        {providers.map((p) => (
          <StatusRow key={p.id} name={p.id.toUpperCase()} configured={p.configured} />
        ))}
        {prowlarr && <StatusRow name="Prowlarr" configured={prowlarr.configured} />}
        {steam && <StatusRow name="Steam" configured={steam.configured} />}
        {qbittorrent && <StatusRow name="qBittorrent" configured={qbittorrent.configured} />}
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-800">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
              activeCategory === cat.id
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {!form ? (
        <p className="text-slate-400">Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {SECTIONS.filter((section) => section.category === activeCategory).map((section) => (
            <div key={section.id} className="bg-slate-900 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{section.title}</h3>
                <div className="flex items-center gap-2">
                  <TestResultBadge result={testResults[section.id]} />
                  <button
                    type="button"
                    onClick={() => handleTest(section.id)}
                    disabled={testResults[section.id] === "loading"}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-50"
                  >
                    Tester
                  </button>
                </div>
              </div>
              {section.fields.map((field) =>
                field.type === "checkbox" ? (
                  <label key={field.key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[field.key] === "true"}
                      onChange={(e) => update(field.key, e.target.checked ? "true" : "false")}
                    />
                    {field.label}
                  </label>
                ) : (
                  <div key={field.key}>
                    <label className="block text-sm text-slate-300 mb-1">{field.label}</label>
                    <input
                      type={field.type}
                      className="w-full bg-slate-800 rounded px-3 py-2"
                      value={form[field.key] || ""}
                      onChange={(e) => update(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  </div>
                )
              )}

              {section.id === "stockage" && (
                <p className="text-xs text-slate-500">
                  Ces chemins sont relatifs au volume <code className="text-slate-400">/data</code>{" "}
                  monté dans docker-compose.yml (lui ne se change pas sans redémarrer le conteneur).
                  Dans le dossier de la bibliothèque, tout jeu rangé sous un sous-dossier{" "}
                  <code className="text-slate-400">Roms/&lt;plateforme&gt;</code> (ex:{" "}
                  <code className="text-slate-400">Roms/Switch/...</code>) est reconnu comme une Rom
                  de cette plateforme quoi qu'en dise la fiche RAWG/IGDB — utile pour un titre qui
                  existe sur plusieurs plateformes (une version Game Boy Color et une version N64 du
                  même jeu, par exemple). Tout le reste est traité comme un jeu PC, selon la
                  métadonnée.
                </p>
              )}

              {section.id === "database" && (
                <p className="text-xs text-slate-500">
                  Relatif au volume <code className="text-slate-400">/config</code>. Contrairement aux
                  autres réglages, un changement ici ne prend effet qu'au redémarrage du conteneur
                  (<code className="text-slate-400">docker compose up -d</code>) : la connexion à la
                  base de données reste ouverte pendant toute la durée de vie du processus. Si le
                  fichier n'existe pas encore, il est créé vide (nouvelle bibliothèque) au démarrage
                  suivant.
                </p>
              )}

              {section.id === "steam" && (
                <p className="text-xs text-slate-500">
                  Clé API sur{" "}
                  <a
                    href="https://steamcommunity.com/dev/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    steamcommunity.com/dev/apikey
                  </a>
                  . Le profil et le détail des jeux doivent être publics pour que la liste des jeux
                  possédés soit accessible (utilisée dans Découvrir pour signaler les doublons).
                </p>
              )}

              {section.id === "qbittorrent" && (
                <p className="text-xs text-slate-500">
                  Une fois configuré, les téléchargements envoyés depuis Gamarr sont surveillés et
                  automatiquement hardlinkés vers la bibliothèque à la fin du téléchargement (statut
                  visible dans l'onglet Historique). Le montage{" "}
                  <code className="text-slate-400">/data</code> (lecture-écriture, voir section
                  "Stockage" ci-dessus pour les sous-dossiers) contient la bibliothèque et le dossier
                  de téléchargement : dans qBittorrent, monte ce même dossier hôte et crée une
                  catégorie dédiée dont le chemin de sauvegarde correspond exactement au dossier de
                  téléchargement configuré ci-dessus — surtout pas un volume Docker séparé, même
                  pointant le même dossier : le hardlink échouerait quand même ("cross-device",
                  visible dans l'Historique en cas d'erreur).
                </p>
              )}

              {section.id === "prowlarr" && (
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-300">Trackers à utiliser</label>
                    <button
                      type="button"
                      onClick={handleLoadIndexers}
                      disabled={loadingIndexers || !form.PROWLARR_URL || !form.PROWLARR_API_KEY}
                      className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-50"
                    >
                      {loadingIndexers ? "Chargement..." : "Charger les trackers"}
                    </button>
                  </div>

                  {indexersError && <p className="text-red-400 text-xs mb-2">{indexersError}</p>}

                  {indexers && (
                    <ul className="space-y-1 max-h-48 overflow-y-auto bg-slate-800 rounded p-2">
                      {indexers.length === 0 ? (
                        <li className="text-xs text-slate-500 p-1">Aucun tracker configuré sur cette instance.</li>
                      ) : (
                        indexers.map((idx) => (
                          <li key={idx.id}>
                            <label className="flex items-center gap-2 p-1 rounded hover:bg-slate-700 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={(form.PROWLARR_INDEXER_IDS || []).includes(idx.id)}
                                onChange={() => toggleIndexer(idx.id)}
                              />
                              <span className={idx.enabled ? "" : "text-slate-500"}>
                                {idx.name} {!idx.enabled && "(désactivé)"}
                              </span>
                            </label>
                          </li>
                        ))
                      )}
                    </ul>
                  )}

                  <p className="text-xs text-slate-500 mt-2">
                    Aucun tracker coché = recherche sur tous les trackers configurés dans Prowlarr.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Les releases bloquées sont exclues des résultats ; les préférées remontent en
                    tête de liste (marquées ★). Comparaison simple sur le titre de la release,
                    insensible à la casse.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Recherche automatique : toutes les 6h, relance une recherche pour chaque jeu
                    "demandé" déjà sorti et grab automatiquement le meilleur résultat (préférences/
                    blacklist ci-dessus appliquées). Un jeu déjà en téléchargement n'est jamais
                    re-grabbé ; sans résultat ou en échec, nouvelle tentative au bout de 24h. Visible
                    dans l'onglet Historique comme une recherche/un téléchargement manuel. Fonctionne
                    mieux avec des préférences renseignées ci-dessus, sinon le meilleur résultat est
                    choisi par nombre de seeders.
                  </p>
                </div>
              )}
            </div>
          ))}

          {savedMsg && <p className="text-emerald-400 text-sm">Réglages enregistrés.</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      )}

      <p className="text-sm text-slate-500 mt-6">
        Ces valeurs sont stockées dans <code className="text-slate-400">config/secrets.json</code>{" "}
        (volume <code className="text-slate-400">/config</code>), prises en compte immédiatement sans
        redémarrage — sauf le fichier de base de données (section "Base de données"), qui demande un
        redémarrage du conteneur. "Tester" vérifie les valeurs saisies ci-dessus, même avant
        d'enregistrer.
      </p>
    </div>
  );
}
