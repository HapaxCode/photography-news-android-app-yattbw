const state = {
  filter: "all",
  bySource: {}, // sourceId -> { items, status: 'loading'|'ok'|'error', fetchedAt }
};

const cardElements = new Map(); // article.link -> element, reused across renders so in-flight <img> loads survive re-renders

const grid = document.getElementById("grid");
const tabsEl = document.getElementById("tabs");
const statusEl = document.getElementById("statusLine");
const refreshBtn = document.getElementById("refreshBtn");
const installBtn = document.getElementById("installBtn");

function timeAgo(date) {
  if (!date || isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function sourceById(id) {
  return SOURCES.find((s) => s.id === id);
}

function buildTabs() {
  const allTab = document.createElement("button");
  allTab.className = "tab active";
  allTab.dataset.filter = "all";
  allTab.textContent = "Tout";
  tabsEl.appendChild(allTab);

  SOURCES.forEach((source) => {
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.dataset.filter = source.id;
    tab.style.setProperty("--accent", source.accent);
    tab.textContent = source.shortName;
    tabsEl.appendChild(tab);
  });

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    state.filter = btn.dataset.filter;
    [...tabsEl.children].forEach((c) => c.classList.toggle("active", c === btn));
    render();
  });
}

function setCardImage(media, img, imageUrl) {
  if (imageUrl) {
    media.classList.remove("no-image");
    if (!img) {
      img = document.createElement("img");
      img.loading = "lazy";
      img.onerror = () => {
        media.classList.add("no-image");
        img.remove();
      };
      media.prepend(img);
    }
    img.src = imageUrl;
  } else if (img) {
    img.remove();
    img = null;
    media.classList.add("no-image");
  } else {
    media.classList.add("no-image");
  }
  return img;
}

// Met à jour une carte déjà présente dans le DOM avec les données les plus récentes,
// sans jamais recréer l'élément (une image en cours de chargement ne doit pas être interrompue).
function updateCard(el, article) {
  const refs = el._refs;
  const source = sourceById(article.sourceId);
  el.href = article.link;
  el.style.setProperty("--accent", source.accent);

  if (refs.img?.src !== article.image) {
    refs.img = setCardImage(refs.media, refs.img, article.image);
  }
  if (refs.img) refs.img.alt = article.title;
  refs.badge.textContent = source.shortName;
  refs.title.textContent = article.title;
  refs.excerpt.textContent = article.excerpt || "";
  refs.excerpt.hidden = !article.excerpt;
  refs.time.textContent = timeAgo(article.pubDate);
  el._article = article;
}

function cardTemplate(article) {
  const source = sourceById(article.sourceId);
  const a = document.createElement("a");
  a.className = "card";
  a.href = article.link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.setProperty("--accent", source.accent);

  const media = document.createElement("div");
  media.className = "card-media";
  let img = setCardImage(media, null, article.image);
  if (img) img.alt = article.title;

  const badge = document.createElement("span");
  badge.className = "source-badge";
  badge.textContent = source.shortName;
  media.appendChild(badge);
  a.appendChild(media);

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = article.title;
  body.appendChild(title);

  const excerpt = document.createElement("p");
  excerpt.className = "card-excerpt";
  excerpt.textContent = article.excerpt || "";
  excerpt.hidden = !article.excerpt;
  body.appendChild(excerpt);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const time = document.createElement("span");
  time.textContent = timeAgo(article.pubDate);
  const readMore = document.createElement("span");
  readMore.className = "read-more";
  readMore.textContent = "Lire l'article →";
  meta.appendChild(time);
  meta.appendChild(readMore);
  body.appendChild(meta);

  a._refs = { media, img, badge, title, excerpt, time };
  a._article = article;

  a.appendChild(body);
  return a;
}

function placeholderCard(message) {
  const div = document.createElement("div");
  div.className = "placeholder-card";
  div.textContent = message;
  return div;
}

function render() {
  const sourcesToShow = state.filter === "all" ? SOURCES : SOURCES.filter((s) => s.id === state.filter);

  let allArticles = [];
  let anyLoading = false;
  let allEmpty = true;

  sourcesToShow.forEach((source) => {
    const entry = state.bySource[source.id];
    if (!entry) return;
    if (entry.status === "loading" && (!entry.items || !entry.items.length)) anyLoading = true;
    if (entry.items && entry.items.length) {
      allEmpty = false;
      allArticles.push(...entry.items);
    }
  });

  if (state.filter === "all") {
    allArticles.sort((a, b) => (b.pubDate?.getTime() || 0) - (a.pubDate?.getTime() || 0));
  }

  // Cartes d'info pour les sources en erreur (pas de contenu en cache non plus).
  const errorNotices = [];
  sourcesToShow.forEach((source) => {
    const entry = state.bySource[source.id];
    if (entry && entry.status === "error" && (!entry.items || !entry.items.length)) {
      errorNotices.push(source);
    }
  });

  const keyOf = (article) => article.sourceId + "::" + article.link;

  let wantedKeys;
  if (allArticles.length === 0 && anyLoading) {
    wantedKeys = ["__loading__"];
  } else if (allArticles.length === 0 && allEmpty && !errorNotices.length) {
    wantedKeys = ["__empty__"];
  } else {
    wantedKeys = allArticles.map(keyOf);
  }
  errorNotices.forEach((source) => wantedKeys.push("__error_" + source.id));

  // Supprime les cartes qui ne doivent plus être affichées (elles ne sont plus dans la liste voulue).
  for (const [key, el] of cardElements) {
    if (!wantedKeys.includes(key)) {
      el.remove();
      cardElements.delete(key);
    }
  }

  // Recrée/positionne chaque carte voulue, en réutilisant l'élément existant s'il y en a un
  // (une image déjà chargée ou en cours de chargement n'est donc jamais interrompue).
  let anchor = null;
  const placeAfter = (el) => {
    if (anchor === null) {
      grid.insertBefore(el, grid.firstChild);
    } else if (anchor.nextSibling !== el) {
      grid.insertBefore(el, anchor.nextSibling);
    }
    anchor = el;
  };

  if (wantedKeys[0] === "__loading__") {
    let el = cardElements.get("__loading__");
    if (!el) {
      el = placeholderCard("Chargement des derniers articles…");
      cardElements.set("__loading__", el);
    }
    placeAfter(el);
  } else if (wantedKeys[0] === "__empty__") {
    let el = cardElements.get("__empty__");
    if (!el) {
      el = placeholderCard(
        "Impossible de récupérer les articles pour le moment. Vérifiez votre connexion puis touchez Actualiser."
      );
      cardElements.set("__empty__", el);
    }
    placeAfter(el);
  } else {
    allArticles.forEach((article) => {
      const key = keyOf(article);
      let el = cardElements.get(key);
      if (!el) {
        el = cardTemplate(article);
        cardElements.set(key, el);
      } else {
        updateCard(el, article);
      }
      placeAfter(el);
    });
  }

  errorNotices.forEach((source) => {
    const key = "__error_" + source.id;
    let el = cardElements.get(key);
    if (!el) {
      el = document.createElement("a");
      el.className = "placeholder-card error-card";
      el.href = source.site;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.textContent = `${source.name} : flux momentanément indisponible — voir le site →`;
      cardElements.set(key, el);
    }
    placeAfter(el);
  });

  updateStatusLine();
}

function updateStatusLine() {
  const timestamps = Object.values(state.bySource)
    .map((e) => e.fetchedAt)
    .filter(Boolean);
  if (!timestamps.length) {
    statusEl.textContent = "";
    return;
  }
  const oldest = new Date(Math.min(...timestamps));
  statusEl.textContent = `Mis à jour ${timeAgo(oldest)}`;
}

async function loadSource(source, { force = false } = {}) {
  if (!force) {
    const cached = getCachedSource(source.id);
    if (cached) {
      state.bySource[source.id] = { items: hydrateDates(cached.items), status: "cached", fetchedAt: cached.fetchedAt };
      render();
    }
  }

  state.bySource[source.id] = {
    ...(state.bySource[source.id] || {}),
    status: "loading",
  };
  render();

  const items = await fetchSourceArticles(source);
  if (items.length) {
    setCachedSource(source.id, items);
    state.bySource[source.id] = { items, status: "ok", fetchedAt: Date.now() };
    render();
    enrichMissingImages(source); // en arrière-plan, ne bloque pas l'affichage
  } else {
    const cached = getCachedSource(source.id);
    state.bySource[source.id] = {
      items: cached ? hydrateDates(cached.items) : [],
      status: "error",
      fetchedAt: cached ? cached.fetchedAt : null,
    };
    render();
  }
}

// Pour les articles dont le flux ne fournit aucune image, va chercher l'og:image
// de la page. Les vignettes apparaissent au fur et à mesure ; le cache est mis à jour.
async function enrichMissingImages(source) {
  const entry = state.bySource[source.id];
  if (!entry || !entry.items) return;
  const missing = entry.items.filter((it) => !it.image && it.link);
  if (!missing.length) return;

  let changed = false;
  for (const item of missing) {
    if (state.bySource[source.id] !== entry) return; // un refresh a remplacé les données
    const og = await fetchOgImage(item.link);
    if (og) {
      item.image = og;
      changed = true;
      render();
    }
  }
  if (changed) setCachedSource(source.id, entry.items);
}

function hydrateDates(items) {
  return items.map((it) => ({ ...it, pubDate: it.pubDate ? new Date(it.pubDate) : null }));
}

async function loadAll(options) {
  refreshBtn.classList.add("spinning");
  await Promise.all(SOURCES.map((source) => loadSource(source, options)));
  refreshBtn.classList.remove("spinning");
}

refreshBtn.addEventListener("click", () => loadAll({ force: true }));

// --- Installation PWA (Android/Chrome) ---
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

buildTabs();
loadAll();
