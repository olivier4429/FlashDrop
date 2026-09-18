# 01 — Fondamentaux du réseau Arc

Sources : `docs.arc.io/arc-chain`, `/arc/concepts/system-overview`, `/arc/concepts/deterministic-finality`, `/arc/concepts/opt-in-privacy`, `/arc/concepts/post-quantum-security` (roadmap), `/arc/references/connect-to-arc`.

> **Mise à jour du 17/09/2026** — L'ambiguïté sur le Chain ID (notée plus bas dans la version précédente) est levée : **Mainnet et Testnet sont deux réseaux distincts, tous deux actifs**, chacun avec son propre Chain ID/RPC/explorer (voir tableau en fin de fichier). Le Mainnet Arc est en ligne depuis le 16 septembre 2026 (confirmé sur `community.arc.io`) — ce dossier de notes a été rédigé initialement dans un contexte testnet-only, à garder en tête en lisant les fichiers 04/10/11 qui restent centrés sur le testnet pour les tutoriels pas-à-pas.

## Qu'est-ce qu'Arc ?

Une blockchain Layer-1 pensée dès le départ pour les applications financières en stablecoins : paiements, prêts/emprunts, FX, gestion de trésorerie, commerce agentique. Pas un token volatil natif — l'USDC en tient lieu (voir fichier 02).

## Architecture à deux couches

Arc sépare **consensus** et **exécution**, deux couches qui avancent ensemble mais s'optimisent indépendamment :

- **Couche consensus — Malachite** : implémentation performante du protocole BFT façon Tendermint. Ordonne les transactions et finalise les blocs sur un ensemble de validateurs permissionnés (Proof-of-Authority, composé d'institutions régulées). Vote en deux phases (pre-vote puis pre-commit) : dès que plus des deux tiers des validateurs sont d'accord, le bloc est **définitif et irréversible**. Débit annoncé : 3000+ TPS avec 20 validateurs, finalité <350ms en benchmark.
- **Couche exécution — Reth** : client Ethereum écrit en Rust. Maintient l'état complet (comptes, soldes, contrats, storage), exécute la logique EVM, calcule la racine d'état (Merkle root). Étend le pipeline standard avec des modules propres à Arc (voir plus bas).

### Cycle de vie d'une transaction

1. Soumission via JSON-RPC
2. Mempool (validation : signature, solde, nonce)
3. Un validateur "proposer" regroupe les transactions en bloc candidat
4. Pre-vote (les validateurs votent sur la validité)
5. Pre-commit (deuxième vote, seuil des 2/3)
6. Commit → bloc finalisé, **irréversible**
7. Exécution EVM + modules Arc
8. Calcul de la racine d'état

Tout ce cycle prend moins d'une seconde.

### Modules propres à Arc (au sein de la couche exécution)

| Module | Statut | Rôle |
|---|---|---|
| Fee Manager | En production | Stabilise les frais de gas en USDC via lissage EWMA (voir fichier 02) |
| Arc Privacy Sector (APS) | Prévu, pas encore actif | Environnement d'exécution confidentiel pour contrats Solidity |
| Stablecoin Services | Prévu, pas encore actif | Règlement multi-devises, transactions sponsorisées, gas payable en plusieurs stablecoins |

Il existe aussi un précompilé **CallFrom**, qui préserve `msg.sender` à travers des appels délégués — utilisé par les contrats Memo et Multicall3From (voir fichier 03) pour permettre des transactions groupées ou annotées sans perdre l'identité de l'appelant d'origine.

## Finalité déterministe

Contrairement aux chaînes probabilistes, une transaction sur Arc n'a que deux états : **non confirmée** ou **finale**. Pas de fenêtre de confirmation, pas de risque de réorganisation de chaîne.

| Réseau | Finalité |
|---|---|
| Arc | < 1 seconde |
| Ethereum L1 | 12–15 minutes (deux epochs d'attestations) |
| Rollup L2 classique | ~7 jours (fenêtre de contestation/preuve) |

**Cas d'usage rendus possibles** : paiement en point de vente sans attendre de confirmations supplémentaires, règlement transfrontalier instantané, compensation institutionnelle, enchaînement d'opérations onchain (ex. swap puis bridge) sans polling.

**Bénéfices développeur** : pas de logique de retry/rollback liée aux reorgs, on peut déclencher des effets offchain (webhook, écriture BDD) dès le commit du bloc, gestion d'état simplifiée (2 états au lieu d'un compteur de confirmations), auditabilité pour la conformité réglementaire.

## Vie privée optionnelle — Arc Privacy Sector (APS)

> ⚠️ Fonctionnalité annoncée mais **pas encore disponible** sur Arc (roadmap).

Concept : un environnement d'exécution confidentiel pour contrats Solidity, qui tourne en parallèle de l'EVM public et finalise dans le même bloc (composabilité synchrone). Objectif : permettre à certaines applications de garder état et données de transaction hors du registre public quand des exigences métier ou réglementaires le justifient, sans sacrifier l'atomicité avec la chaîne publique.

Principes clés prévus :
- **Isolation par défaut ("default-deny")** : à son déploiement, un contrat est invisible à tout appelant externe, sauf exposition explicite (politiques d'accès par fonction : `Open`/`Restricted`/`Locked`, domaines de confiance via `addTrustee`).
- Les logs d'événements sont désactivés par défaut, les sondes d'introspection inter-domaines sont masquées, les raisons de revert sont assainies.
- Chiffrement post-quantique hybride (X-Wing KEM = X25519 + ML-KEM-768, AES-256-GCM/GCM-SIV, TLS 1.3 avec X25519MLKEM768).
- Clé maîtresse partagée entre validateurs par secret sharing de Shamir, reconstruisible seulement dans des enclaves matérielles attestées.

Un contrat Solidity standard (ex. ERC-20 OpenZeppelin) pourrait être déployé dans APS sans changer le bytecode ; on configure ensuite via les domaines de confiance quelles fonctions restent ouvertes ou restreintes.

## Sécurité post-quantique

Arc prévoit des signatures de wallet **SLH-DSA-SHA2-128s** pour protéger les comptes contre les menaces quantiques futures — mentionné comme fonctionnalité clé de l'architecture (roadmap, à recouper avec `/arc/concepts/post-quantum-security` si besoin de détails).

## Détails réseau — Mainnet et Testnet (vérifié sur `/arc/references/connect-to-arc`, 17/09/2026)

| Propriété | Mainnet | Testnet |
|---|---|---|
| Consensus | Malachite BFT | Malachite BFT |
| Environnement d'exécution | EVM (hard fork Osaka) | EVM (hard fork Osaka) |
| Token de gas | USDC | USDC |
| Temps de bloc | ~0,48 s | ~0,48 s |
| **Chain ID** | **5042** | **5042002** |
| RPC principal | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| RPC tiers | Alchemy, Blockdaemon, dRPC, QuickNode (URLs dédiées par fournisseur) | Blockdaemon, dRPC, QuickNode |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| Faucet | — (pas de faucet mainnet, USDC réel requis) | `https://faucet.circle.com` |
| Finalité | Déterministe, sub-seconde | Déterministe, sub-seconde |
| Participation validateurs | Permissionnée | Permissionnée |
| Accès développeur | Permissionless | Permissionless |

`viem` fournit les deux chaînes nativement : `import { arc } from "viem/chains"` (mainnet) et `import { arcTestnet } from "viem/chains"` (testnet) — pas besoin de les redéfinir à la main sauf besoin spécifique (ex. Reown AppKit qui requiert son propre `defineChain`).

⚠️ Ne pas confondre avec le sentinel EIP-7528 ni avec le token natif "affiché comme ETH" par certains wallets qui ne gèrent pas les gas tokens custom : dans les deux cas le solde affiché correspond bien à de l'USDC (18 décimales natif), voir fichier 02.
