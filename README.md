# Cartothèque

Plateforme de collection Pokémon TCG : catalogue français complet (20 029 cartes), cote expliquée, scanner photo, classeurs virtuels, wishlist, échanges entre membres.

| Où | Quoi |
|---|---|
| https://noahhrcy.github.io/cartotheque/ | Application web installable (Chrome Android : menu ⋮ > « Installer l'application » ; iPhone : Safari > Partager > « Sur l'écran d'accueil ») |
| https://github.com/noahhrcy/cartotheque/releases/tag/beta | Fichier `.apk` Android de test |
| https://github.com/noahhrcy/cartotheque/releases/tag/ios-beta | Fichier `.ipa` iOS de test (non signé, à installer avec Sideloadly) |
| Supabase (projet à créer, voir plus bas) | Comptes, base de données, scanner |
| https://claude.ai/artifact/Crdog5ses2vqgciZXQ8fUE | Prototype initial (version Claude) |

## Architecture

- **Front** : une seule page web (Preact + htm, sans compilation) servie par GitHub Pages, installable (PWA, cache hors-ligne).
- **Android** : coque Capacitor qui ouvre la version en ligne ; compilée gratuitement par GitHub Actions (`.github/workflows/android.yml`).
- **iOS** : même coque, compilée sur un Mac de GitHub Actions (`.github/workflows/ios.yml`, préparation dans `mobile/prepare-ios.sh`). Le même workflow lance l'application sur un iPhone simulé et publie des captures (onglet Actions > artefact `captures-ios`).
- **Adresses** : chaque page a son adresse (`#card/sv03.5-151`, `#cards/pikachu`, `#set/sv03.5`…) : lien partageable, rechargement sans perte de la page.
- **Serveur** : Supabase (offre gratuite) — authentification e-mail, PostgreSQL avec règles d'accès par ligne (collection privée, échanges visibles des seuls participants), temps réel pour les échanges, fonction `scan` (lecture IA optionnelle, payante).
- **Scanner gratuit** (`src/visual.js`), par défaut, illimité, sur l'appareil : détection du contour de la carte, empreinte de l'illustration comparée aux 17 120 cartes de `public/data/visual.bin` (1,6 Mo, calculé par `scripts/build_visual_index.py`), puis lecture du numéro imprimé avec Tesseract.js pour départager les rééditions.
- **Données** : catalogue et prix TCGdex (Cardmarket + TCGplayer) régénérés chaque jour à 10 h 40 UTC par `.github/workflows/prices.yml`, qui enregistre aussi l'historique des prix (`public/data/history/`).

## Brancher Supabase (une seule fois, environ 10 minutes)

1. Créer un compte sur https://supabase.com puis **New project** : nom `cartotheque`, région **West EU (Paris)**, notez le mot de passe de la base.
2. **SQL Editor > New query** : coller tout le contenu de `supabase/schema.sql`, cliquer **Run**.
3. **Authentication > Sign In / Providers > Email** : désactiver **Confirm email** (l'envoi d'e-mails gratuit de Supabase est réservé à l'équipe du projet ; sans ce réglage, les testeurs ne pourraient pas valider leur compte).
4. **Edge Functions > Deploy a new function > Via Editor** : nom `scan`, coller `supabase/functions/scan/index.ts`, déployer. Dans les réglages de la fonction, désactiver **Verify JWT** (la fonction vérifie elle-même la session du membre).
5. Lecture IA (facultative, payante ; le scanner gratuit fonctionne sans) : **Edge Functions > Secrets** : ajouter `ANTHROPIC_API_KEY` (clé créée sur https://console.anthropic.com). Modèle utilisé : `claude-opus-5-5` ; pour réduire le coût par scan, ajouter le secret `SCAN_MODEL` = `claude-haiku-5-5`.
6. **Project Settings > API** : copier **Project URL** et la clé **publishable** (ou **anon public**). Ces deux valeurs sont publiques par conception ; ce sont les règles de la base qui protègent les données.
7. Les reporter dans `public/config.js`, puis pousser : le site se redéploie tout seul.
8. Créer votre compte en premier dans l'application : **le premier compte devient administrateur**.

## Commandes utiles

```bash
python scripts/fetch_tcgdex.py raw                  # télécharger catalogue + prix
python scripts/build_data.py raw public             # générer public/data
python scripts/update_history.py public             # ajouter le jour à l'historique
python scripts/build_visual_index.py public vcache  # empreintes visuelles (incrémental ; nécessite Pillow et numpy)
python scripts/build_html.py src public --target web    # application web
python scripts/build_html.py src build/artifact         # version Claude
python scripts/make_icons.py .                      # icônes web, Android et iOS
```

## Limites de la version de test

- APK signé avec une clé de débogage : installation manuelle (« sources inconnues »), pas de Play Store.
- IPA non signée : TestFlight et l'App Store demandent l'Apple Developer Program (99 $/an). Sans lui, installation par Sideloadly avec un identifiant Apple gratuit, à renouveler tous les 7 jours ; la version web ajoutée à l'écran d'accueil n'a pas cette limite.
- Les visuels de cartes proviennent de TCGdex et restent la propriété de The Pokémon Company : licence à obtenir avant toute commercialisation.
- Les prix Cardmarket/TCGplayer sont relayés par TCGdex : contrat de données à négocier avant lancement commercial.
- Pas de récupération de mot de passe par e-mail tant qu'un service d'envoi (SMTP) n'est pas branché dans Supabase.
