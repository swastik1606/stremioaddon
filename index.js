const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PORT = process.env.PORT || 7000;

const manifest = {
  id: "com.randomep.stremio",
  version: "1.2.0",
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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

// Returns N unique random episodes from across all seasons
async function getRandomEpisodes(tmdbId, count = 10) {
  const show = await tmdb(`/tv/${tmdbId}`);
  const validSeasons = show.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
  if (!validSeasons.length) return { show, episodes: [] };

  // Fetch all season details in parallel
  const seasonDetails = await Promise.all(
    validSeasons.map(s => tmdb(`/tv/${tmdbId}/season/${s.season_number}`))
  );

  // Flatten all episodes
  const allEpisodes = seasonDetails.flatMap(sd =>
    (sd.episodes || []).map(ep => ({
      season: sd.season_number,
      episode: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
    }))
  );

  // Shuffle and take N unique ones
  return { show, episodes: shuffle(allEpisodes).slice(0, count) };
}

builder.defineCatalogHandler(async ({ id, extra }) => {
  if (id !== "random-ep-search") return { metas: [] };
  const query = extra && extra.search;
  const endpoint = query
    ? `/search/tv?query=${encodeURIComponent(query)}&page=1`
    : `/tv/popular?page=1`;
  const data = await tmdb(endpoint);
  const metas = (data.results || []).slice(0, 20).map(show => ({
    id: `randomep:${show.id}`,
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

  const tmdbId = id.split(":")[1];

  const [imdbId, { show, episodes }] = await Promise.all([
    getImdbId(tmdbId),
    getRandomEpisodes(tmdbId, 10),
  ]);

  if (!imdbId || !episodes.length) return { meta: null };

  // Each video uses the real IMDB ID format so Torrentio picks it up
  // Every time the meta is loaded, a fresh shuffle is returned
  const videos = episodes.map((ep, i) => {
    const s = String(ep.season).padStart(2, "0");
    const e = String(ep.episode).padStart(2, "0");
    return {
      id: `${imdbId}:${ep.season}:${ep.episode}`,
      title: `🎲 #${i + 1} — S${s}E${e}${ep.name ? ` · ${ep.name}` : ""}`,
      season: ep.season,
      episode: ep.episode,
      released: new Date(Date.now() - i * 1000).toISOString(), // stagger so they sort correctly
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
      description: `🎲 ${videos.length} random episodes picked for you. Go back & reopen for a fresh batch!\n\n${show.overview}`,
      releaseInfo: show.first_air_date?.slice(0, 4),
      videos,
    },
  };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🎲 Random Episode addon v1.2.0 running on port ${PORT}`);


function posterUrl(path) {
  return path
    ? `https://image.tmdb.org/t/p/w500${path}`
    : "https://i.imgur.com/sS4J4Vz.png";
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getRandomEpisode(tmdbId) {
  const show = await tmdb(`/tv/${tmdbId}`);
  const seasons = show.seasons.filter(
    (s) => s.season_number > 0 && s.episode_count > 0
  );
  if (!seasons.length) return null;
  const season = pick(seasons);
  const detail = await tmdb(`/tv/${tmdbId}/season/${season.season_number}`);
  const episode = pick(detail.episodes);
  return { show, season: season.season_number, episode };
}

// ─── Catalog ─────────────────────────────────────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "series" || id !== "random-ep-search") return { metas: [] };

  const query = extra && extra.search;
  if (!query) {
    // Show popular series as default landing
    const data = await tmdb("/tv/popular?page=1");
    const metas = (data.results || []).slice(0, 20).map((show) => ({
      id: `randomep:${show.id}`,
      type: "series",
      name: show.name,
      poster: posterUrl(show.poster_path),
      description: show.overview,
      releaseInfo: show.first_air_date?.slice(0, 4),
    }));
    return { metas };
  }

  const data = await tmdb(
    `/search/tv?query=${encodeURIComponent(query)}&page=1`
  );
  const metas = (data.results || []).slice(0, 10).map((show) => ({
    id: `randomep:${show.id}`,
    type: "series",
    name: show.name,
    poster: posterUrl(show.poster_path),
    description: show.overview,
    releaseInfo: show.first_air_date?.slice(0, 4),
  }));
  return { metas };
});

// ─── Meta ─────────────────────────────────────────────────────────────────────
builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series" || !id.startsWith("randomep:")) return { meta: null };

  const tmdbId = id.split(":")[1];
  const show = await tmdb(`/tv/${tmdbId}`);

  // Build fake video list so Stremio shows a single "Random Episode" button
  const videos = [
    {
      id: `randomep:${tmdbId}:random`,
      title: "🎲 Play Random Episode",
      released: new Date().toISOString(),
      season: 0,
      episode: 0,
    },
  ];

  return {
    meta: {
      id,
      type: "series",
      name: show.name,
      poster: posterUrl(show.poster_path),
      background: show.backdrop_path
        ? `https://image.tmdb.org/t/p/original${show.backdrop_path}`
        : undefined,
      description: show.overview,
      releaseInfo: show.first_air_date?.slice(0, 4),
      videos,
    },
  };
});

// ─── Stream ───────────────────────────────────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "series" || !id.startsWith("randomep:")) return { streams: [] };

  const parts = id.split(":");
  const tmdbId = parts[1];

  try {
    const result = await getRandomEpisode(tmdbId);
    if (!result) return { streams: [] };

    const { show, season, episode } = result;
    const epTitle = episode.name || `Episode ${episode.episode_number}`;
    const description = episode.overview || "No description available.";

    // We link to vidsrc which is a free embed that works for many shows
    const vidsrcUrl = `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode.episode_number}`;
    const vidsrc2Url = `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode.episode_number}`;

    return {
      streams: [
        {
          name: `🎲 Random Episode`,
          title: `S${String(season).padStart(2,"0")}E${String(episode.episode_number).padStart(2,"0")} — ${epTitle}\n${description.slice(0, 120)}${description.length > 120 ? "…" : ""}`,
          externalUrl: vidsrcUrl,
        },
        {
          name: `🎲 Mirror`,
          title: `S${String(season).padStart(2,"0")}E${String(episode.episode_number).padStart(2,"0")} — ${epTitle} (Mirror)`,
          externalUrl: vidsrc2Url,
        },
      ],
    };
  } catch (err) {
    console.error("Stream error:", err);
    return { streams: [] };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🎲 Random Episode addon running on http://localhost:${PORT}`);
console.log(`   Install URL: http://localhost:${PORT}/manifest.json`);
