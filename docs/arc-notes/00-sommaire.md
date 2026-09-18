# Notes Arc — Sommaire

Sources : [community.arc.io](https://community.arc.io/home/content) (contenu communautaire, articles, vidéos) et [docs.arc.io](https://docs.arc.io) (doc technique officielle, indexée via `/llms.txt`).

Objectif de ce dossier : avoir une base de référence pour comprendre les concepts fonctionnels d'Arc avant de se lancer dans le développement. Chaque fichier peut être approfondi à la demande (relire la doc source correspondante) quand une question précise se pose.

> **Vérification live du 17/09/2026** : l'ensemble du dossier a été comparé aux pages actuelles de `docs.arc.io` et `community.arc.io/home/content`. Résultat : contenu globalement fidèle et à jour. Corrections apportées : détails d'indexation des événements USDC manquants (fichier 02), clarification définitive mainnet (chain ID 5042) vs testnet (5042002) désormais tous deux actifs (fichiers 01/04/10/11), ajout de 3 contenus communautaires (fichier 12), points de vigilance mis à jour (fichier 13). Fichiers 03, 05, 06, 07, 08, 09 vérifiés sans écart trouvé.

## Fichiers

| # | Fichier | Contenu |
|---|---------|---------|
| 01 | `01-fondamentaux-reseau.md` | Qu'est-ce qu'Arc : architecture (consensus/exécution), finalité déterministe, vie privée optionnelle, sécurité post-quantique |
| 02 | `02-modele-stablecoin-gas.md` | USDC comme gas natif, modèle à deux interfaces, design des frais, différences avec l'EVM standard |
| 03 | `03-adresses-contrats.md` | Adresses de référence (USDC, EURC, USYC, CCTP, Gateway, StableFX, Permit2...) mainnet/testnet |
| 04 | `04-build-deployer.md` | Vue d'ensemble "Build", tutoriel de déploiement (Arc Foundry), déploiement de templates via Circle, interaction et monitoring de contrats |
| 05 | `05-agents-ia.md` | Économie agentique (ERC-8004 identité, ERC-8183 jobs), serveur MCP Arc pour coder avec l'IA |
| 06 | `06-app-kit-vue-ensemble.md` | App Kit : SDK unique pour Bridge/Swap/Send/Unified Balance/Onramp/Earn |
| 07 | `07-app-kit-bridge-swap-send.md` | Détail des capacités Bridge, Swap, Send |
| 08 | `08-app-kit-unified-balance.md` | Solde unifié multichain (basé sur Circle Gateway) |
| 09 | `09-app-kit-onramp-earn.md` | Onramp (achat fiat→stablecoin) et Earn (rendement) |
| 10 | `10-integrer-arc.md` | Intégration côté wallets, exchanges, on/off-ramps, infrastructure |
| 11 | `11-outils-infra.md` | Fournisseurs de nœuds, indexeurs, oracles, account abstraction, conformité |
| 12 | `12-concepts-communaute-arc-house.md` | Synthèse du contenu communautaire (Arc 101, Stablecoin 101, StableFX, Gateway, lancement mainnet) |
| 13 | `13-questions-fonctionnelles-a-explorer.md` | Espace de travail : questions ouvertes à creuser avant de développer |

## À retenir en une phrase

Arc est une blockchain Layer-1 conçue pour la finance en stablecoins : l'USDC sert de token de gas natif (plus de token volatil à gérer), la finalité est déterministe en moins d'une seconde, et la compatibilité EVM est quasi totale (Solidity, Foundry, Hardhat, Viem fonctionnent presque sans changement) — à condition de connaître une poignée de différences protocolaires importantes (voir fichier 02).

## Prochaine étape suggérée

Lire les fichiers 01 et 02 pour la compréhension conceptuelle, puis le fichier 13 pour noter les questions fonctionnelles au fur et à mesure. Le développement concret (fichier 04) peut attendre que les concepts soient clairs.
