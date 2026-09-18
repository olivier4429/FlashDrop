# 12 — Synthèse du contenu communautaire (community.arc.io — "Arc House")

Source : `community.arc.io/home/content`. Ce site est plus orienté actualités/pédagogie (articles courts, vidéos, séries) que référence technique. Les collections principales, non explorées item par item ici (à parcourir directement sur le site si un sujet précis intéresse) :

| Collection | Nb d'items | Sujet |
|---|---|---|
| Become an Architect | 6 | Programme "Architects" (voir plus bas) |
| Day One Architects Series | 7 | Retours d'expérience des premiers bâtisseurs sur Arc |
| Arc 101 | 31 | Série pédagogique sur les fondamentaux d'Arc |
| Stablecoin 101 | 22 | Série pédagogique sur les stablecoins en général |
| Circle Agent Stack Series | 1 | Développement d'agents IA avec les outils Circle |

## Événements et actualités clés (au moment de la rédaction, mi-septembre 2026)

- **Arc Mainnet est en ligne** (annoncé le 16-17 septembre 2026, articles de Tim Baker) — présenté comme un "OS économique pour Internet" : plateforme financière ouverte pour marchés globaux, mouvement de valeur en temps réel, activité économique agentique. Développeurs, institutions, utilisateurs et agents autonomes ont accès dès le premier jour aux actifs, marchés, applications et infrastructure du réseau.
- Un événement de lancement mainnet incluait des shows de drones au-dessus de San Francisco (Ferry Building) autour de trois thèmes : mainnet Arc, commerce autonome par machines, communauté de bâtisseurs.
- **Fund Gateway from Slow-Finality Chains with Fast Deposits** — amélioration technique permettant de financer un solde Gateway en moins d'une minute même depuis une chaîne à finalité lente, via `transferSpeed: "FAST"` (détaillé fichier 08).
- **StableFX** — moteur de FX onchain combinant cotations fermes par RFQ (Request-for-Quote) et règlement atomique "Payment-versus-Payment" (les deux jambes d'un échange de devises se règlent simultanément, éliminant le risque de règlement). Contrat de référence : `FxEscrow` (fichier 03).
- **How to Access USDC Crosschain with Gateway** — épisode "Arc 101" montrant comment déposer de l'USDC dans Gateway sur Arc puis exécuter des mints sur Base, Avalanche, Arbitrum, etc., sans jongler entre bridges et swaps.
- **Arc Compatibility Guide for Existing EVM Apps** — la plupart des apps EVM peuvent migrer vers Arc avec un changement architectural minimal, mais un petit ensemble de différences protocolaires (fichier 02) doit être compris avant la mise en production.
- *(Ajoutés le 17/09/2026, repérés en re-parcourant le site — absents de la première synthèse) :*
  - **Understanding StableFX on Arc** (Elton Tay, Arc 101) — épisode vidéo qui reprend le fonctionnement de StableFX (RFQ + règlement PvP atomique, voir plus bas), complémentaire du contrat `FxEscrow` (fichier 03).
  - **Supporting Arc in Wallets: One Balance, USDC Fees, and Complete History** — article ciblé "wallets" : rendre correctement le solde unique, les frais en USDC, et l'historique complet côté UX (recoupe le fichier 10, "Fee display" et "Transaction lifecycle").
  - **USDC for Every Action: How Arc Simplifies Building Onchain** — article qui reformule la thèse centrale du fichier 02 (plus de token de gas volatil séparé) côté narration produit/développeur.

## Programme "Architects"

Mentionné comme "Become an Architect" et "Architects: Program Overview" (contenu populaire) — semble être un programme d'accompagnement/reconnaissance pour les équipes qui construisent tôt sur Arc, avec des conditions dédiées ("Architects Program Terms & Conditions"). Utile à explorer si Jalios envisage une relation plus formelle avec Circle/Arc (accompagnement technique, visibilité, financement via "Arc Builders Fund" mentionné dans un article sur "Tradable").

## Deux idées structurantes issues du contenu communautaire (reformulées)

1. **Une seule identité pour l'USDC, deux façons de la lire.** Un article communautaire insiste sur le fait que chaque transaction et appel de contrat sur Arc est payé en USDC, et que ce même USDC est disponible via une API ERC-20 pour la logique applicative — mais qu'il faut rester attentif à l'interface utilisée (natif vs ERC-20), surtout avec des SDK/frameworks qui supposent un environnement EVM traditionnel. (Cf. fichier 02 pour le détail technique.)
2. **Compatibilité ≠ absence de changement.** Le guide de compatibilité communautaire précise qu'un solde suffisant ne garantit pas qu'un appel avec valeur native réussira : envoi vers l'adresse zéro, adresse blocklistée, certains chemins de `SELFDESTRUCT` peuvent faire échouer la transaction. Une application ne doit pas supposer que l'USDC n'entre dans un contrat que par les méthodes ERC-20.

## FAQ Arc House

Un article "Arc House: Frequently Asked Questions" existe sur le site — à consulter directement si des questions générales (non techniques) se posent sur le programme communautaire lui-même, les événements, ou la gouvernance du contenu.

## Ce que ce site n'est pas

Il ne remplace pas `docs.arc.io` pour les détails d'implémentation (adresses de contrat, paramètres de gas, comportements EVM précis) : c'est davantage un lieu de contexte, d'actualité et de mise en récit du projet Arc. Pour toute question fonctionnelle qui touche à "comment ça marche vraiment", se référer aux fichiers 01-11.
