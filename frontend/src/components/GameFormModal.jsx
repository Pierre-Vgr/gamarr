import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { STATUS_OPTIONS } from "./StatusBadge.jsx";

const EMPTY_FORM = {
  title: "",
  platforms: "",
  status: "backlog",
  coverUrl: "",
  description: "",
  releaseDate: "",
  genres: "",
  rating: "",
  notes: "",
};

function gameToForm(game) {
  if (!game) return EMPTY_FORM;
  return {
    title: game.title || "",
    platforms: (game.platforms || []).join(", "),
    status: game.status || "backlog",
    coverUrl: game.cover_url || "",
    description: game.description || "",
    releaseDate: game.release_date || "",
    genres: (game.genres || []).join(", "),
    rating: game.rating ?? "",
    notes: game.notes || "",
  };
}

export function GameFormModal({ game, onClose, onSaved }) {
  const [form, setForm] = useState(() => gameToForm(game));
  const [query, setQuery] = useState(game?.title || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(gameToForm(game));
  }, [game]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const found = await api.searchMetadata(query);
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function applyResult(result) {
    setError(null);
    try {
      const details = await api.getMetadataDetails(result.source, result.externalId);
      setForm({
        title: details.title || "",
        platforms: (details.platforms || []).join(", "),
        status: form.status,
        coverUrl: details.coverUrl || "",
        description: details.description || "",
        releaseDate: details.releaseDate || "",
        genres: (details.genres || []).join(", "),
        rating: form.rating,
        notes: form.notes,
      });
      setResults([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Le titre est obligatoire");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      platforms: form.platforms.split(",").map((s) => s.trim()).filter(Boolean),
      status: form.status,
      coverUrl: form.coverUrl || null,
      description: form.description || null,
      releaseDate: form.releaseDate || null,
      genres: form.genres.split(",").map((s) => s.trim()).filter(Boolean),
      rating: form.rating === "" ? null : Number(form.rating),
      notes: form.notes || null,
    };

    try {
      if (game) {
        await api.updateGame(game.id, payload);
      } else {
        await api.createGame(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-semibold mb-4">
          {game ? "Modifier le jeu" : "Ajouter un jeu"}
        </h2>

        {!game && (
          <div className="mb-6 p-4 bg-slate-800 rounded-lg">
            <label className="block text-sm text-slate-300 mb-2">
              Rechercher les métadonnées (RAWG)
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-700 rounded px-3 py-2 text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
                placeholder="Titre du jeu..."
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
              >
                {searching ? "Recherche..." : "Chercher"}
              </button>
            </div>
            {results.length > 0 && (
              <ul className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.externalId}>
                    <button
                      type="button"
                      onClick={() => applyResult(r)}
                      className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-700 text-left text-sm"
                    >
                      {r.coverUrl && (
                        <img src={r.coverUrl} alt="" className="w-8 h-10 object-cover rounded" />
                      )}
                      <span>
                        {r.title} {r.releaseDate ? `(${r.releaseDate.slice(0, 4)})` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Titre *</label>
            <input
              className="w-full bg-slate-800 rounded px-3 py-2"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Plateformes</label>
              <input
                className="w-full bg-slate-800 rounded px-3 py-2"
                value={form.platforms}
                onChange={(e) => update("platforms", e.target.value)}
                placeholder="PC, Switch, ..."
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Statut</label>
              <select
                className="w-full bg-slate-800 rounded px-3 py-2"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">URL de la cover</label>
            <input
              className="w-full bg-slate-800 rounded px-3 py-2"
              value={form.coverUrl}
              onChange={(e) => update("coverUrl", e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Date de sortie</label>
              <input
                type="date"
                className="w-full bg-slate-800 rounded px-3 py-2"
                value={form.releaseDate}
                onChange={(e) => update("releaseDate", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Note (0-5)</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.5"
                className="w-full bg-slate-800 rounded px-3 py-2"
                value={form.rating}
                onChange={(e) => update("rating", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Genres</label>
            <input
              className="w-full bg-slate-800 rounded px-3 py-2"
              value={form.genres}
              onChange={(e) => update("genres", e.target.value)}
              placeholder="RPG, Aventure, ..."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Description</label>
            <textarea
              className="w-full bg-slate-800 rounded px-3 py-2 h-24"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Notes personnelles</label>
            <textarea
              className="w-full bg-slate-800 rounded px-3 py-2 h-20"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
