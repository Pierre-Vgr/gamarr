import { StatusBadge } from "./StatusBadge.jsx";
import { ProtonBadge } from "./ProtonBadge.jsx";
import { MetacriticBadge } from "./MetacriticBadge.jsx";

export function GameInfoPanel({
  title,
  coverUrl,
  platforms,
  releaseDate,
  genres,
  status,
  stores,
  protonTier,
  metacriticScore,
  communityRating,
  ratingsCount,
  description,
  notes,
  personalRating,
  screenshots,
  trailers,
}) {
  const trailer = trailers?.[0];
  return (
    <>
      <div className="flex gap-4">
        <div className="w-32 shrink-0 aspect-[3/4] bg-slate-800 rounded overflow-hidden">
          {coverUrl ? (
            <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs text-center p-2">
              Pas de cover
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            {status && <StatusBadge status={status} />}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {platforms?.join(", ") || "Plateforme inconnue"}
            {releaseDate && ` · ${releaseDate.slice(0, 4)}`}
          </p>
          {genres?.length > 0 && <p className="text-sm text-slate-500 mt-1">{genres.join(", ")}</p>}
          {(stores?.length > 0 || protonTier) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {stores?.map((s) => (
                <span
                  key={s.slug || s.name}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300"
                >
                  {s.name}
                </span>
              ))}
              <ProtonBadge tier={protonTier} />
            </div>
          )}
          {personalRating != null && (
            <p className="text-sm text-slate-400 mt-2">Note : {personalRating} / 5</p>
          )}
        </div>

        {(metacriticScore != null || communityRating != null) && (
          <div className="flex flex-col items-center gap-2 shrink-0 pl-4 border-l border-slate-800">
            {metacriticScore != null && <MetacriticBadge score={metacriticScore} size="lg" showLabel />}
            {communityRating != null && (
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-200">{communityRating}/100</p>
                <p className="text-[10px] text-slate-500">
                  communauté{ratingsCount ? ` · ${ratingsCount} avis` : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {description && <p className="text-sm text-slate-300 mt-4 leading-relaxed">{description}</p>}

      {notes && (
        <div className="mt-4 p-3 bg-slate-800 rounded">
          <p className="text-xs text-slate-500 mb-1">Notes personnelles</p>
          <p className="text-sm text-slate-300">{notes}</p>
        </div>
      )}

      {trailer && (
        <div className="mt-4">
          <p className="text-xs text-slate-500 mb-2">Trailer</p>
          {trailer.youtube ? (
            <iframe
              src={trailer.videoUrl}
              title={trailer.name || "Trailer"}
              className="w-full aspect-video rounded"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              src={trailer.videoUrl}
              poster={trailer.thumbnail || undefined}
              controls
              className="w-full rounded"
            />
          )}
        </div>
      )}

      {screenshots?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-slate-500 mb-2">Captures d'écran</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {screenshots.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={url} alt="" className="h-24 rounded object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
