import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function StatusRow({ name, configured, hint }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800">
      <div>
        <p className="font-medium">{name}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
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

export function SettingsView() {
  const [providers, setProviders] = useState([]);
  const [prowlarr, setProwlarr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.listProviders(), api.prowlarrStatus()])
      .then(([p, pr]) => {
        setProviders(p);
        setProwlarr(pr);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-4">Intégrations</h2>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="bg-slate-900 rounded-lg p-4">
        {providers.map((p) => (
          <StatusRow key={p.id} name={p.id.toUpperCase()} configured={p.configured} />
        ))}
        {prowlarr && <StatusRow name="Prowlarr" configured={prowlarr.configured} />}
      </div>

      <p className="text-sm text-slate-500 mt-4">
        Ces intégrations se configurent en éditant <code className="text-slate-400">config/secrets.json</code>{" "}
        (volume <code className="text-slate-400">/config</code>) — les clés y sont relues à chaud, sans
        redémarrage. Voir <code className="text-slate-400">secrets.json.example</code> pour le format attendu.
      </p>
    </div>
  );
}
