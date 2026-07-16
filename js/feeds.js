// Sources et logique de récupération/normalisation des flux RSS.
// Chaque source liste plusieurs URLs de flux candidates : la première qui répond
// avec des articles est retenue et mémorisée (localStorage) pour les prochaines visites.

const SOURCES = [
  {
    id: "oeil",
    name: "L'Œil de la photographie",
    shortName: "L'Œil",
    site: "https://www.loeildelaphotographie.com/",
    accent: "#caa54b",
    feedCandidates: [
      "https://www.loeildelaphotographie.com/fr/feed/",
      "https://www.loeildelaphotographie.com/feed/",
      "https://www.loeildelaphotographie.com/en/feed/",
    ],
  },
  {
    id: "fisheye",
    name: "Fisheye Magazine",
    shortName: "Fisheye",
    site: "https://www.fisheyeimmersive.com/",
    accent: "#ff5da2",
    feedCandidates: [
      "https://www.fisheyeimmersive.com/feed/",
    ],
  },
  {
    id: "polka",
    name: "Polka Magazine",
    shortName: "Polka",
    site: "https://www.polkagalerie.com/",
    accent: "#e2483d",
    feedCandidates: [
      "https://www.polkagalerie.com/feed/",
      "https://www.polkagalerie.com/feed",
    ],
  },
  {
    id: "lensculture",
    name: "LensCulture",
    shortName: "LensCulture",
    site: "https://www.lensculture.com/",
    accent: "#3aa0ff",
    feedCandidates: [
      "https://www.lensculture.com/feed",
      "https://www.lensculture.com/feed.xml",
      "https://www.lensculture.com/feed/latest",
      "https://www.lensculture.com/rss",
    ],
  },
];

const ARTICLES_PER_SOURCE = 10;
const CACHE_KEY = "photoNewsCache_v1";

const CORS_PROXIES = [
  // 1) rss2json : fait aussi le parsing XML->JSON pour nous (le plus fiable pour l'image de couverture)
  (feedUrl) => ({
    url: "https://api.rss2json.com/v1/api.json?count=" + ARTICLES_PER_SOURCE + "&rss_url=" + encodeURIComponent(feedUrl),
    kind: "rss2json",
  }),
  // 2) allorigins : simple passthrough, on parse le XML nous-mêmes
  (feedUrl) => ({
    url: "https://api.allorigins.win/raw?url=" + encodeURIComponent(feedUrl),
    kind: "xml",
  }),
  // 3) corsproxy.io : deuxième passthrough de secours
  (feedUrl) => ({
    url: "https://corsproxy.io/?url=" + encodeURIComponent(feedUrl),
    kind: "xml",
  }),
];

function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function firstImageFromHtml(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img[src]");
  return img ? img.getAttribute("src") : null;
}

function excerptFrom(text, max = 160) {
  const clean = stripHtml(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// --- Normalisation depuis la réponse rss2json ---
function normalizeFromRss2Json(json, source) {
  if (!json || json.status !== "ok" || !Array.isArray(json.items)) return [];
  return json.items.slice(0, ARTICLES_PER_SOURCE).map((item) => {
    const image =
      item.thumbnail ||
      item.enclosure?.link ||
      firstImageFromHtml(item.content || item.description) ||
      null;
    return {
      sourceId: source.id,
      title: stripHtml(item.title) || "(Sans titre)",
      link: item.link || item.guid || source.site,
      pubDate: item.pubDate ? new Date(item.pubDate.replace(" ", "T")) : null,
      excerpt: excerptFrom(item.description || item.content || ""),
      image,
    };
  });
}

// --- Normalisation depuis un flux XML brut (RSS 2.0 ou Atom) ---
function normalizeFromXml(xmlText, source) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return [];

  const rssItems = Array.from(doc.querySelectorAll("item"));
  if (rssItems.length) {
    return rssItems.slice(0, ARTICLES_PER_SOURCE).map((item) => {
      const title = item.querySelector("title")?.textContent || "(Sans titre)";
      const link = item.querySelector("link")?.textContent || source.site;
      const pubDateRaw = item.querySelector("pubDate")?.textContent;
      const description =
        item.getElementsByTagName("content:encoded")[0]?.textContent ||
        item.querySelector("description")?.textContent ||
        "";
      const enclosure = item.querySelector("enclosure[url]");
      const mediaContent =
        item.getElementsByTagName("media:content")[0]?.getAttribute("url") ||
        item.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url");
      const image =
        (enclosure && /image/.test(enclosure.getAttribute("type") || "image") && enclosure.getAttribute("url")) ||
        mediaContent ||
        firstImageFromHtml(description) ||
        null;

      return {
        sourceId: source.id,
        title: stripHtml(title),
        link,
        pubDate: pubDateRaw ? new Date(pubDateRaw) : null,
        excerpt: excerptFrom(description),
        image,
      };
    });
  }

  // Atom fallback
  const entries = Array.from(doc.querySelectorAll("entry"));
  return entries.slice(0, ARTICLES_PER_SOURCE).map((entry) => {
    const title = entry.querySelector("title")?.textContent || "(Sans titre)";
    const linkEl =
      entry.querySelector("link[rel='alternate']") || entry.querySelector("link");
    const link = linkEl?.getAttribute("href") || source.site;
    const updated = entry.querySelector("updated")?.textContent || entry.querySelector("published")?.textContent;
    const content = entry.querySelector("content")?.textContent || entry.querySelector("summary")?.textContent || "";
    const image = firstImageFromHtml(content);

    return {
      sourceId: source.id,
      title: stripHtml(title),
      link,
      pubDate: updated ? new Date(updated) : null,
      excerpt: excerptFrom(content),
      image,
    };
  });
}

async function fetchViaProxy(feedUrl, proxyFactory, source, timeoutMs = 9000) {
  const { url, kind } = proxyFactory(feedUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return [];
    if (kind === "rss2json") {
      const json = await res.json();
      return normalizeFromRss2Json(json, source);
    }
    const text = await res.text();
    return normalizeFromXml(text, source);
  } catch (err) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Essaie chaque URL candidate de la source, avec chaque proxy, jusqu'à obtenir des articles.
async function fetchSourceArticles(source) {
  for (const feedUrl of source.feedCandidates) {
    for (const proxyFactory of CORS_PROXIES) {
      const items = await fetchViaProxy(feedUrl, proxyFactory, source);
      if (items.length) return items;
    }
  }
  return [];
}

// --- Cache localStorage ---
function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota dépassé ou stockage indisponible : tant pis, pas de cache persistant */
  }
}

function getCachedSource(sourceId) {
  const cache = loadCache();
  return cache[sourceId] || null;
}

function setCachedSource(sourceId, items) {
  const cache = loadCache();
  cache[sourceId] = { items, fetchedAt: Date.now() };
  saveCache(cache);
}
