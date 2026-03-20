# 🎲 Random Episode Addon — Phone Setup (5 steps)

---

## Step 1 — Get free TMDB API key
1. Go to **themoviedb.org** → sign up free
2. Go to **Settings → API → Create → Developer**
3. Fill any details in → submit
4. Copy your **API Key (v3)** — save it somewhere

---

## Step 2 — Put this on GitHub
1. On GitHub, tap **+** → **New repository**
2. Name it `stremio-random-episode`
3. Make it **Public** → tap **Create repository**
4. Tap **uploading an existing file**
5. Upload all 3 files (`index.js`, `package.json`, `render.yaml`)
6. Tap **Commit changes**

---

## Step 3 — Deploy to Render (one click)
1. Go to: **https://render.com** → sign up with GitHub
2. Tap **New → Blueprint**
3. Select your `stremio-random-episode` repo
4. It will ask for `TMDB_API_KEY` → paste your key from Step 1
5. Tap **Apply** → wait ~2 minutes

You'll get a URL like `https://stremio-random-episode.onrender.com`

---

## Step 4 — Install in Stremio
1. Open Stremio → Addons → search bar
2. Paste your Render URL + `/manifest.json`
   Example: `https://stremio-random-episode.onrender.com/manifest.json`
3. Tap Install ✅

---

## Step 5 — Use it!
- Go to Discover → Series → Random Episode
- Search any show → tap it → tap 🎲 Play Random Episode
- Done! Never touch it again 🎉
