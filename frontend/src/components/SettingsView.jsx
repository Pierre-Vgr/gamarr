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
      {result.valid ? "✓ Valide" : `✗ ${result.message || "Invalide"}`}
    </span>
  );
}

const SECTIONS = [
  {
    id: "rawg",
    title: "RAWG",
    fields: [{ key: "RAWG_API_KEY", label: "Clé API", type: "password" }],
  },
  {
    id: "igdb",
    title: "IGDB",
    fields: [
      { key: "IGDB_CLIENT_ID", label: "Client ID", type: "text" },
      { key: "IGDB_CLIENT_SECRET", label: "Client Secret", type: "password" },
    ],
  },
  {
    id: "prowlarr",
    title: "Prowlarr",
    fields: [
      { key: "PROWLARR_URL", label: "URL", type: "text", placeholder: "https://..." },
      { key: "PROWLARR_API_KEY", label: "Clé API", type: "password" },
    ],
  },
];

export function SettingsView() {
  const [form, setForm] = useState(null);
  const [providers, setProviders] = useState([]);
  const [prowlarr, setProwlarr] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [indexers, setIndexers] = useState(null);
  const [loadingIndexers, setLoadingIndexers] = useState(false);
  const [indexersError, setIndexersError] = useState(null);

  async function loadStatus() {
    try {
      const [p, pr] = await Promise.all([api.listProviders(), api.prowlarrStatus()]);
      setProviders(p);
      setProwlarr(pr);
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
      if (sectionId === "rawg") {
        result = await api.testRawg(form.RAWG_API_KEY);
      } else if (sectionId === "igdb") {
        result = await api.testIgdb(form.IGDB_CLIENT_ID, form.IGDB_CLIENT_SECRET);
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

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-slate-900 rounded-lg p-4 mb-6 divide-y divide-slate-800">
        {providers.map((p) => (
          <StatusRow key={p.id} name={p.id.toUpperCase()} configured={p.configured} />
        ))}
        {prowlarr && <StatusRow name="Prowlarr" configured={prowlarr.configured} />}
      </div>

      {!form ? (
        <p className="text-slate-400">Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {SECTIONS.map((section) => (
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
              {section.fields.map((field) => (
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
              ))}

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
        redémarrage. "Tester" vérifie les valeurs saisies ci-dessus, même avant d'enregistrer.
      </p>
    </div>
  );
}
