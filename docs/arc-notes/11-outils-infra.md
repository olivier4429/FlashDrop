# 11 : Outils et infrastructure tiers

Source : index `docs.arc.io/llms.txt`, section "Tools and Infrastructure".

| Outil | Rôle | Fournisseurs cités |
|---|---|---|
| **Node Providers** (`/arc/tools/node-providers`) | Accès RPC managé, sans opérer son propre nœud | Alchemy, QuickNode, Blockdaemon, dRPC |
| **Data Indexers** (`/arc/tools/data-indexers`) | Requêter des données onchain via API/sous-graphes | Envio, Goldsky, The Graph, Thirdweb |
| **Oracles** (`/arc/tools/oracles`) | Flux de prix et données offchain | (fournisseurs non détaillés dans l'index : à vérifier à la source) |
| **Account Abstraction** (`/arc/tools/account-abstraction`) | Smart wallets, paymasters, session keys | Fournisseurs de l'écosystème (non listés en détail ici) |
| **Compliance** (`/arc/tools/compliance-vendors`) | Analyse de transactions, filtrage de wallets | Elliptic, TRM Labs |

## Explorer et faucet

- **Explorer mainnet** : `https://explorer.arc.io` *(ajouté le 17/09/2026 : le mainnet est en ligne depuis le 16/09/2026, voir fichier 01)*.
- **Explorer testnet** : `https://explorer.testnet.arc.io` (basé sur Blockscout : voir fichier 04 pour la vérification de contrat).
- **Faucet testnet** : `https://faucet.circle.com` : distribue USDC, EURC de test. Pas d'équivalent mainnet (USDC réel requis).
- **Gas Tracker** : `https://explorer.testnet.arc.io/gas-tracker` : métriques de gas en temps réel et historique (voir fichier 02). Confirmé encore documenté uniquement côté testnet au 17/09/2026 ; à revérifier si un équivalent mainnet apparaît.

## Exécuter son propre nœud

- **Running a Node** (`/arc/concepts/running-a-node`) : architecture et rôles des nœuds.
- **Run an Arc Node** (`/arc/tutorials/run-an-arc-node`) : tutoriel pas-à-pas.

Pertinent seulement si le projet a besoin d'un accès RPC direct sans dépendre d'un tiers, ou de vérification indépendante : pour la plupart des cas d'usage applicatifs, un node provider managé (Alchemy, QuickNode...) ou le RPC public Arc suffit.

## Points à vérifier avant de choisir un fournisseur

- **Account abstraction** : quel paymaster choisir si l'objectif est de sponsoriser le gas pour les utilisateurs finaux ? (rappel fichier 02 : le paiement multi-stablecoin du gas n'est pas encore supporté nativement au lancement : un paymaster reste la voie pour sponsoriser).
- **Compliance** : la blocklist Arc est appliquée au runtime protocole (fichier 02) : un outil de conformité tiers (Elliptic/TRM) sert plutôt à la détection/reporting en amont, pas à remplacer l'enforcement onchain.
- **Indexeurs** : bien prendre en compte le double événement `Transfer` (natif + ERC-20) décrit au fichier 02 pour éviter le double comptage.
