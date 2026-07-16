# Photo News

Application web installable (PWA) qui réunit les 10 derniers articles de :

- [L'Œil de la photographie](https://www.loeildelaphotographie.com/)
- [Fisheye Magazine](https://www.fisheyeimmersive.com/)
- [Polka Magazine](https://www.polkagalerie.com/)
- [LensCulture](https://www.lensculture.com/)

## Utilisation

1. Héberger ce dépôt sur un serveur HTTPS statique — par exemple en activant GitHub Pages sur ce dépôt (Settings → Pages → Deploy from branch `main` / `root`) : l'app sera disponible sur `https://hapaxcode.github.io/photography-news-android-app-yattbw/`.
2. Ouvrir cette URL avec Chrome sur Android.
3. Chrome propose automatiquement "Ajouter à l'écran d'accueil" / "Installer l'application" (ou via le bouton "Installer" dans l'en-tête de l'app) : une fois installée, l'app se lance en plein écran comme une app native.

L'application fonctionne aussi simplement dans un navigateur, sans installation.

## Fonctionnement technique

- Chaque source est une simple config dans `js/feeds.js` (URL du flux RSS + candidats de secours).
- Les flux RSS sont récupérés côté client via une chaîne de proxys CORS (`rss2json.com`, puis deux passthrough XML de secours), car ces sites ne permettent pas le fetch direct depuis un navigateur.
- Les 10 derniers articles de chaque source sont mis en cache dans `localStorage` : l'app affiche instantanément la dernière version connue puis se rafraîchit en arrière-plan.
- Un service worker (`service-worker.js`) met seulement en cache l'app shell (HTML/CSS/JS/icônes) pour un lancement hors-ligne ; les images d'articles et les appels aux flux ne sont pas interceptés par le service worker.

## Point d'attention

Les URL de flux RSS candidates (dans `js/feeds.js`) ont été renseignées à partir des schémas WordPress usuels de ces sites, mais n'ont pas pu être vérifiées en direct depuis l'environnement où l'app a été générée (accès réseau sortant restreint). En particulier, la disponibilité d'un flux RSS public pour LensCulture n'est pas garantie. Si une source affiche "flux momentanément indisponible", vérifiez/ajustez `feedCandidates` pour cette source dans `js/feeds.js`.
