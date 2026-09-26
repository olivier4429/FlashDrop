# Arc Flash Drop : Brief de projet

## Contexte

Candidature au programme **Arc Microgrants** (Circle/Arc) : 500 USDC par projet, POC/petite app **déployée et fonctionnelle sur Arc mainnet**, deadline de soumission le **14 octobre 2026**. Les projets de hackathon sont éligibles. Le programme valorise la **promesse plus que la traction** : mais évalue sur : pertinence pour Arc, crédibilité technique, qualité de ce qui est construit, potentiel à être poussé plus loin.

## Idées explorées et écartées (pour ne pas y revenir)

| Idée | Pourquoi écartée |
|---|---|
| StableFX Rate Griot (surveiller les prix FX) | StableFX est **permissionné** (KYB/AML institutionnel requis), aucune donnée publique observable sans clé API Circle |
| Coupe-circuit anti-fraude sur le mempool | Arc **désactive la visibilité du mempool** au niveau RPC (`eth_subscribe("newPendingTransactions")` renvoie une erreur -32001), et le temps de bloc (~0,5s) ne laisse de toute façon aucune fenêtre pratique d'observation pré-finalité |
| Bug bounty (course à l'horodatage) | Ne dépend pas vraiment de la vitesse d'Arc : fonctionnerait pareil sur une chaîne lente |
| Réponse à la demande électrique | Marché institutionnel fermé (agrégateurs agréés, compteurs certifiés), goulot d'étranglement réel = physique, pas le règlement |
| Marché spot GPU | Les vrais marchés (Akash, io.net, Render) fonctionnent par enchère inversée sur plusieurs minutes, pas par "course au paiement" ; pas d'inventaire GPU réel accessible pour un hackathon |
| **Arc Liquidation Watchtower** (surveiller Aave V4 sur Arc et liquider les positions sous-collatéralisées) | **Techniquement solide et entièrement vérifié** (adresses et ABI réelles récupérées sur `explorer.arc.io`, voir Annexe) : mis de côté non pas pour un problème de faisabilité, mais parce que la démo finale ressemblerait à un tableau de bord de bot de liquidation classique, peu spectaculaire pour un jury. Gardé en annexe si on veut y revenir. |
| Machine qui ne fonctionne que si le paiement coule en continu (recharge de drone/véhicule, distributeur d'eau, imprimante 3D à la couche) | Pistes solides sur le papier (vraie nécessité de vitesse), mais écartées pour rester original par rapport à la communication événementielle d'Arc (spectacle de drones du lancement mainnet) et faute d'avoir arrêté un choix clair |
| Marketplace "anti-chargeback" / enchère avec dépôt verrouillé | **Leçon importante** : l'irréversibilité d'une transaction n'est PAS spécifique à Arc : Bitcoin, Ethereum, Solana l'ont aussi une fois confirmée. Ce qui est spécifique à Arc, c'est la vitesse à laquelle cette irréversibilité est acquise (sub-seconde et déterministe, pas probabiliste). Idée elle-même écartée en plus pour une raison de démo : la version marketplace ressemblerait à un site e-commerce classique, rien de visuellement distinctif. |

## Le concept retenu : "Arc Flash Drop"

**Mécanisme** : une enchère inversée (reverse Dutch auction) sur **un seul produit à la fois**. Le prix affiché décroît en temps réel depuis un `startPrice` jusqu'à un `endPrice` sur une durée fixée. Le premier acheteur qui valide son achat au prix affiché à cet instant l'emporte : la vente se ferme immédiatement (`sold = true`), pas de gestion de catalogue ni de stock.

**Simplification actée** : une seule vente active à la fois. Pas de catalogue multi-produits concurrents dans le MVP. En revanche (décision du 18/09/2026, revenant sur le choix initial de redéployer à chaque objet), le même contrat est réutilisable d'une vente à l'autre : une fois la vente en cours conclue (`sold == true`), le vendeur (et lui seul) peut appeler `startNewSale(itemName, itemDescription, startPrice, endPrice, duration)` pour armer le prochain objet sur cette même instance, sans redéploiement. Voir `contracts/script/startNewSale.ts`.

**Titre/description on-chain** (décision du 21/09/2026) : `itemName`/`itemDescription` sont stockés dans le contrat (fixés au constructeur et à chaque `startNewSale`), pas seulement côté frontend : comme le même contrat est réutilisé séquentiellement pour plusieurs objets, un titre géré uniquement en config frontend risquait de rester désynchronisé (ancien titre affiché avec le nouveau prix) si le vendeur oubliait de le mettre à jour à côté.

### Pourquoi Arc est réellement nécessaire ici (pas cosmétique)

- **Pas de mempool public sur Arc** (`eth_subscribe("newPendingTransactions")` désactivé, confirmé en direct pendant la conception) → élimine structurellement le **front-running par des tiers** : sur une chaîne à mempool public (Ethereum notamment), un bot peut voir la transaction d'achat de quelqu'un en attente, la copier avec un priority fee plus élevé, être inclus avant et emporter l'article au prix que l'acheteur avait choisi : une forme de MEV bien documentée sur les mints NFT et autres ventes on-chain sensibles au timing (contournable sur Ethereum via des RPC privés type Flashbots Protect, mais c'est un outil opt-in que la plupart des acheteurs n'utilisent pas). Sur Arc, cette classe d'attaque par un observateur extérieur est impossible ; l'ordre des transactions dans un bloc reste en revanche décidé par les validateurs. Vocabulaire : dire "front-running", pas "sniping" (qui désigne plutôt l'achat rapide d'offres sous-évaluées), et ne pas citer les sneakers (bots off-chain, sans mempool).
- **Finalité déterministe sub-seconde** → dès qu'un achat est finalisé, il n'y a aucune ambiguïté ni contestation possible sur "qui a vraiment acheté en premier au bon prix" : pas de risque de réorganisation qui changerait le gagnant après coup.
- Contraste explicite avec l'argument "irréversibilité" écarté plus haut : ici ce n'est pas l'irréversibilité en soi qui compte (toutes les chaînes l'ont), c'est la **vitesse combinée à l'absence de mempool** qui rend le mécanisme robuste : un vrai différenciateur Arc.

### Pourquoi la démo est spectaculaire (pas un site e-commerce déguisé)

Le prix qui décroît est un **compte à rebours visuel en direct** : pas une page de paiement statique. Devant un jury : "regardez, le prix descend, dans 3, 2, 1... et voilà, transaction finalisée, gagnant désigné, sans contestation possible." Alternative encore plus interactive envisagée si besoin : un "Buzzer Duel" où le jury lui-même déclenche deux transactions concurrentes et voit en direct laquelle est incluse en premier.

## Le contrat

Esquissé initialement dans ce brief (version simplifiée sans Permit2, avec `transferFrom` direct
et des champs `immutable`) ; l'implémentation réelle a depuis évolué : voir directement
`contracts/src/FlashDrop.sol`, qui reste la source de vérité, pour éviter qu'une copie ici ne
devienne obsolète à chaque évolution. Différences principales par rapport à l'esquisse d'origine :
achat via signature Permit2 (pas de `transferFrom` direct dans `buy()`), et `startPrice`/`endPrice`/
`startTime`/`duration` ne sont plus `immutable` depuis l'ajout de `startNewSale` (réutilisation du
contrat entre plusieurs ventes, décision du 18/09/2026 : voir plus haut).

**Note sur `block.timestamp`** : les notes Arc (fichier 02) préviennent que `block.timestamp` n'est pas strictement croissant et ne doit jamais servir à **ordonner** des événements/blocs. Ici on ne l'utilise pas pour ordonner : juste pour lire une horloge murale approximative afin de calculer une décroissance de prix lissée. Usage légitime, à bien distinguer du piège documenté.

### Permit2 : le détail qui montre une vraie compréhension d'Arc

`Permit2` est déjà déployé sur Arc (mainnet ET testnet, adresse identique) à `0x000000000022D473030F116dDEE9F6B43aC78BA3` (fichier 03 des notes). L'utiliser permet à l'acheteur de **signer une seule fois** au lieu de faire un `approve()` séparé avant d'acheter : important pour le côté "instantané" du concept : personne ne veut faire deux transactions l'une après l'autre pendant que le prix continue de chuter.

## Décisions tranchées

- **Décroissance linéaire** (retenue le 18/09/2026) : formule simple, facile à auditer et à tester, cohérente avec l'esquisse de contrat ci-dessus. L'option exponentielle (plus spectaculaire visuellement) a été écartée pour privilégier la lisibilité de la démo et la simplicité des tests.
- **Objet symbolique/numérique pour la démo** (retenu le 18/09/2026) : pas de logistique d'envoi physique ni de risque de planning avant la deadline du 14 octobre 2026. La démo se concentre sur le mécanisme on-chain (compte à rebours + achat), pas sur un objet réel à expédier.
- **`cancelSale()` explicite plutôt qu'un `startNewSale()` assoupli** (retenu le 21/09/2026) : pour annuler une vente active sans acheteur, ajout d'un état `cancelled` distinct de `sold` (et de l'événement `SaleCancelled`), plutôt que de simplement retirer la contrainte `require(sold)` de `startNewSale`. Garde une trace on-chain propre (une vente annulée n'apparaît jamais comme "vendue" dans l'historique du frontend, qui ne lit que les événements `Sold`) et évite de confondre les deux états. `buy()` rejette aussi explicitement un achat sur une vente annulée (`"Sale was cancelled"`).

## Décision encore ouverte

- **Extension agentique optionnelle** : plusieurs "agents acheteurs" avec des stratégies différentes (acheter tout de suite vs attendre un prix plus bas), avec identité/réputation façon ERC-8004, si on veut enrichir le projet au-delà du MVP. Pas nécessaire pour la version de base.

## Réseau et adresses utiles (Arc mainnet)

- RPC : `https://rpc.mainnet.arc.io`
- Chain ID : `5042`
- Explorer : `https://explorer.arc.io`
- USDC (ERC-20, gas natif aussi) : `0x3600000000000000000000000000000000000000`
- Permit2 : `0x000000000022D473030F116dDEE9F6B43aC78BA3`

## Notes de référence Arc (contexte général du projet)

Voir les fichiers `00-sommaire.md` à `13-questions-fonctionnelles-a-explorer.md` (notes de veille technique sur Arc). Copier ces fichiers dans le dossier du projet aux côtés de ce brief.

---

## Annexe : recherche conservée de la piste précédente (Arc Liquidation Watchtower)

Mise de côté pour raison de démo (pas de problème de faisabilité), mais toute la recherche ci-dessous est vérifiée et réutilisable si on change d'avis.

**Concept** : surveiller les positions d'emprunt sur Aave V4 (déployé sur Arc mainnet dès le lancement) et liquider celles qui deviennent sous-collatéralisées ; la prime de liquidation existe déjà nativement dans le protocole.

**Contrats Aave V4 vérifiés sur Arc mainnet (via l'API Blockscout d'explorer.arc.io) :**

| Contrat | Adresse |
|---|---|
| Core Hub | `0x17288dfc86205301064577b98B02b81017e6F79C` |
| Main Spoke (marché de prêt principal) | `0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d` |
| Main Spoke implémentation (SpokeInstance) | `0xf76b49F5911Ca3838a469563c0ffB07c8f91ba79` |
| Main Spoke Oracle | `0x6ffE98F3422041236c19923EDB949F18A69e8A09` |
| Liquidation Logic | `0x818E84198224535FAeaEc1b583d3Ff6b812A5AF3` |

**Événements/fonctions clés (ABI vérifiée) :**
```solidity
event Borrow(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 drawnAmount);
event LiquidationCall(uint256 indexed collateralReserveId, uint256 indexed debtReserveId, address indexed user, address liquidator, bool receiveShares, uint256 debtAmountRestored, uint256 drawnSharesLiquidated, tuple premiumDelta, uint256 collateralAmountRemoved, uint256 collateralSharesLiquidated, uint256 collateralSharesToLiquidator);

function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount);
function liquidationCall(uint256 collateralReserveId, uint256 debtReserveId, address user, uint256 debtToCover, bool receiveShares);
```

Particularité notée : la prime de liquidation Aave V4 suit une enchère à la hollandaise (plus le facteur de santé est bas, plus la prime est élevée). Pas d'endpoint documenté pour lister en masse les positions sous-collatéralisées : il faut construire sa propre découverte d'emprunteurs via les événements `Borrow`.
