# Mon Hub — écran d'accueil centralisant tous mes projets

Page web façon **écran d'accueil iPhone** (Linktree / app store) qui centralise tous mes projets : sites, web apps, SaaS, repos GitHub.

## Stack
- **Vanilla JS** — zéro dépendance, zéro build
- **CSS custom** — thème dark, icônes squircles iOS, dégradés
- **PWA** — installable sur iPhone (manifest + service worker)

## Architecture
```
hub/
├── index.html          # Écran d'accueil (grille + dock)
├── css/style.css       # Squircles, dock, overlay dossier, gigue édition
├── js/app.js           # Rendu, dossiers, drag & drop, localStorage
├── data/apps.json      # ⭐ SOURCE DE VÉRITÉ — liste des projets
├── manifest.json       # PWA
├── sw.js               # Service worker (apps.json en network-first)
└── icons/              # icônes 192/512
```

## Ajouter un projet (temps réel)
Éditer `data/apps.json` et ajouter un objet dans `apps` :
```json
{
  "id": "mon-projet",
  "name": "Nom affiché",
  "emoji": "🚀",
  "color": "#ff2d55",
  "url": "https://...",
  "desc": "description",
  "folder": "SaaS"        // optionnel : range dans un dossier
}
```
- Sans `folder` → icône seule sur la grille
- Avec `folder` → regroupé dans un dossier (créé auto s'il n'existe pas)
- Les dossiers se définissent dans la clé `folders` (emoji + couleur)

Le service worker recharge `apps.json` en **network-first** : la mise à jour apparaît au prochain chargement, sans vider le cache manuellement.

## Fonctionnalités
- Grille d'icônes 4 colonnes (5 sur tablette/desktop)
- **Dossiers façon iPhone** : mini-grille 3×3, ouverture en overlay flouté
- **Mode réorganisation** (bouton ✏️) : drag & drop des icônes, ordre sauvegardé en localStorage
- **Dock** en bas (apps épinglées)
- Horloge + barre de statut
- PWA installable (ajouter à l'écran d'accueil)

## Déploiement
- **VPS** : nginx sert `hub/` sur le port 4000 (`/etc/nginx/sites-available/hub`)
- **GitHub Pages** : push sur `main` → déploiement auto
