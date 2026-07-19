# Photo News

Application web installable (PWA) qui réunit les 10 derniers articles de :

- [L'Œil de la photographie](https://www.loeildelaphotographie.com/)
- [Fisheye Magazine](https://www.fisheyeimmersive.com/)
- [Polka Magazine](https://www.polkagalerie.com/)
- [LensCulture](https://www.lensculture.com/)
- [Street Photography France](https://streetphotographyfrance.fr/)

## Utilisation

Un workflow GitHub Actions (`.github/workflows/deploy-pages.yml`) déploie automatiquement l'app sur GitHub Pages à chaque push sur `main`.

1. **Une seule fois** : dans ce dépôt, aller sur **Settings → Pages → Build and deployment → Source**, choisir **"GitHub Actions"** (au lieu de "Deploy from a branch"). Ce réglage doit être fait manuellement depuis l'interface GitHub : le jeton utilisé par le workflow n'a pas le droit de créer le site Pages lui-même (seule une action humaine dans les Settings le peut), il peut seulement déployer une fois le site créé.
2. Une fois ce réglage fait, relancer le workflow (onglet **Actions** → "Deploy GitHub Pages" → "Run workflow", ou repousser un commit) : l'app devient disponible sur `https://hapaxcode.github.io/photography-news-android-app-yattbw/`.
3. Ouvrir cette URL avec Chrome sur Android.
4. Chrome propose automatiquement "Ajouter à l'écran d'accueil" / "Installer l'application" (ou via le bouton "Installer" dans l'en-tête de l'app) : une fois installée, l'app se lance en plein écran comme une app native.

L'application fonctionne aussi simplement dans un navigateur, sans installation. Une fois Pages activé, chaque nouveau push sur `main` redéploie automatiquement (onglet **Actions** du dépôt pour suivre les déploiements).

⚠️ Ce dépôt est actuellement **privé** : les dépôts privés peuvent utiliser GitHub Pages (déploiement via Actions), mais le site publié reste accessible publiquement par son URL dès qu'il est activé, quelle que soit la visibilité du dépôt (sauf plan GitHub Pro/Team/Enterprise avec restriction d'accès activée).

## Fonctionnement technique

- Chaque source est une simple config dans `js/feeds.js` (URL du flux RSS + candidats de secours).
- Les flux RSS sont récupérés côté client via une chaîne de proxys CORS (`rss2json.com`, puis deux passthrough XML de secours), car ces sites ne permettent pas le fetch direct depuis un navigateur.
- Les 10 derniers articles de chaque source sont mis en cache dans `localStorage` : l'app affiche instantanément la dernière version connue puis se rafraîchit en arrière-plan.
- Un service worker (`service-worker.js`) met seulement en cache l'app shell (HTML/CSS/JS/icônes) pour un lancement hors-ligne ; les images d'articles et les appels aux flux ne sont pas interceptés par le service worker.

## Sources et flux

Les URL de flux sont configurées dans `js/feeds.js` (champ `feedCandidates` de chaque source, essayées dans l'ordre jusqu'à ce que l'une réponde).

- **L'Œil de la photographie**, **Fisheye** et **Street Photography France** : flux RSS natifs des sites.
- **LensCulture** : flux Flipboard officiel (`/feeds/flipboard.rss`).
- **Polka** : le site `polkagalerie.com` n'expose pas de flux RSS natif. L'app retombe donc sur **Google Actualités** filtré sur le domaine (`site:polkagalerie.com`). Conséquence : pour cette source uniquement, les liens passent par une redirection Google et les images de couverture sont souvent absentes (visuel générique sur la carte). Si Polka publie un jour un vrai flux RSS, ajoutez-le en tête de ses `feedCandidates` : il sera automatiquement préféré.

Si une source affiche « flux momentanément indisponible », ajustez ses `feedCandidates` dans `js/feeds.js`.
