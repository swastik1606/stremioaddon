const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PORT = process.env.PORT || 7000;

const manifest = {
  id: "com.randomep.stremio",
  version: "1.3.0",
  name: "🎲 Random Episode",
  description: "Pick a show, get a random episode via your existing streaming addons.",
  logo: "https://i.imgur.com/sS4J4Vz.png",
  resources: ["catalog", "meta"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "random-ep-search",
      name: "Random Episode",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  behaviorHints: { configurable: false },
};

const builder = new addonBuilder(manifest);

async function tmdb(path) {
  const fetch = (await import("node-fetch")).default;
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function posterUrl(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : "https://i.imgur.com/sS4J4Vz.png";
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getImdbId(tmdbId) {
  const data = await tmdb(`/tv/${tmdbId}/external_ids`);
  return data.imdb_id || null;
}

async function getRandomEpisodes(tmdbId, count = 10) {
  const show = await tmdb(`/tv/${tmdbId}`);
  const validSeasons = show.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
  if (!validSeasons.length) return { show, episodes: [] };

  const seasonDetails = await Promise.all(
    validSeasons.map(s => tmdb(`/tv/${tmdbId}/season/${s.season_number}`))
  );

  const allEpisodes = seasonDetails.flatMap(sd =>
    (sd.episodes || []).map(ep => ({
      season: sd.season_number,
      episode: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
    }))
  );

  return { show, episodes: shuffle(allEpisodes).slice(0, count) };
}

// Catalog: each show ID includes a timestamp bucket (changes every 5 min)
// so Stremio sees it as a new item and won't serve cached meta
builder.defineCatalogHandler(async ({ id, extra }) => {
  if (id !== "random-ep-search") return { metas: [] };
  const query = extra && extra.search;
  const endpoint = query
    ? `/search/tv?query=${encodeURIComponent(query)}&page=1`
    : `/tv/popular?page=1`;
  const data = await tmdb(endpoint);

  // Timestamp bucket: changes every 5 minutes, busting Stremio's cache
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));

  const metas = (data.results || []).slice(0, 20).map(show => ({
    id: `randomep:${show.id}:${bucket}`,
    type: "series",
    name: show.name,
    poster: posterUrl(show.poster_path),
    description: show.overview,
    releaseInfo: show.first_air_date?.slice(0, 4),
  }));
  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series" || !id.startsWith("randomep:")) return { meta: null };

  // ID format: randomep:tmdbId:bucket  (bucket may or may not be present)
  const tmdbId = id.split(":")[1];

  const [imdbId, { show, episodes }] = await Promise.all([
    getImdbId(tmdbId),
    getRandomEpisodes(tmdbId, 10),
  ]);

  if (!imdbId || !episodes.length) return { meta: null };

  const videos = episodes.map((ep, i) => {
    const s = String(ep.season).padStart(2, "0");
    const e = String(ep.episode).padStart(2, "0");
    return {
      id: `${imdbId}:${ep.season}:${ep.episode}`,
      title: `🎲 #${i + 1} — S${s}E${e}${ep.name ? ` · ${ep.name}` : ""}`,
      season: ep.season,
      episode: ep.episode,
      released: new Date(Date.now() - i * 1000).toISOString(),
      overview: ep.overview || "",
    };
  });

  return {
    meta: {
      id,
      type: "series",
      name: show.name,
      poster: posterUrl(show.poster_path),
      background: show.backdrop_path
        ? `https://image.tmdb.org/t/p/original${show.backdrop_path}`
        : undefined,
      description: `🎲 ${videos.length} random episodes ready. Go back & reopen for a fresh batch!\n\n${show.overview}`,
      releaseInfo: show.first_air_date?.slice(0, 4),
      videos,
    },
  };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🎲 Random Episode addon v1.3.0 running on port ${PORT}`);
