# 10 : Intégrer Arc (wallets, exchanges, infrastructure)

Source : `docs.arc.io/integrate`.

> **Mise à jour du 17/09/2026** : Ajout de la distinction mainnet/testnet dans "Essentiels" ci-dessous (le mainnet Arc est en ligne depuis le 16/09/2026, avec sa propre config réseau : voir fichier 01).

Ce fichier concerne surtout ceux qui **construisent une brique d'infrastructure autour d'Arc** (wallet, exchange, rampe fiat, indexeur...) plutôt qu'une application qui *utilise* Arc. Utile pour comprendre "ce qu'un partenaire technique devrait gérer" même si Jalios n'est pas ce partenaire.

## Trois différences qui pilotent la majorité du travail d'intégration

1. **USDC comme gas** : tout relayer, paymaster ou wallet financé doit détenir de l'USDC. Impacte l'estimation de gas, l'affichage des frais, les API de solde.
2. **Finalité déterministe** : transactions finales en moins d'une seconde, sans risque de réorganisation. Une seule confirmation suffit (pas besoin d'attendre plusieurs blocs).
3. **Double interface USDC** : solde natif 18 décimales / interface ERC-20 6 décimales, même solde sous-jacent (détaillé fichier 02).

## Exchanges

- **Exchange integration** : vue d'ensemble dépôt/retrait/bridging.
- **Detect deposits** : s'abonner aux blocs, détecter les transferts USDC entrants avec finalité en une seule confirmation.
- **Process withdrawals** : construire, signer, diffuser des transactions de retrait avec gas en USDC.
- **Bridge USDC (CCTP)** : déplacer de la liquidité USDC vers/depuis Arc via CCTP.
- **Custody providers** : configuration de Fireblocks, BitGo, SAFE et autres plateformes de garde pour Arc.

## On/off-ramps

- **On/off-ramp integration** : enregistrement de chaîne, détection de dépôt, traitement de retrait, affichage UI pour les fournisseurs de rampe fiat.

## Wallets

- **Wallet integration** : vue d'ensemble (wallets embarqués, smart wallets, extensions navigateur).
- **Add Arc to a wallet** : configuration de chaîne, affichage de solde, historique de transaction, gestion des frais.
- **Transaction lifecycle** : modèle à deux états (en attente / final), pas d'état de confirmation intermédiaire.
- **Fee display** : récupérer, estimer, afficher les frais de transaction en USDC.

## Infrastructure

- **Infrastructure integration** : différences clés par rapport aux chaînes EVM standard, métadonnées de chaîne.
- **Index events** : événements de transfert unifiés, indexation sans gestion de reorg, guidance de streaming de blocs.
- **Bridges** : configuration de la finalité, routage CCTP, infrastructure de relais pour les protocoles de bridge.
- **Compliance** : application de la blocklist, surveillance du contrat Memo, intégrations d'outils de conformité.

## Essentiels (rappel)
- **Connect to Arc** : endpoints RPC, chain ID, URLs WebSocket, liens d'explorer. Mainnet (chain ID 5042, `explorer.arc.io`) et Testnet (chain ID 5042002, `explorer.testnet.arc.io`) sont deux configurations distinctes et toutes deux actives depuis le lancement du mainnet le 16/09/2026 : voir fichier 01 pour le tableau complet des deux réseaux (RPC, WebSocket, fournisseurs tiers).
- **Deploy on Arc** : déployer/tester/interagir avec un contrat Solidity (voir fichier 04).
- **EVM compatibility** : tableau complet des différences (fichier 02).
- **Run a node** : opérer son propre nœud Arc pour vérification indépendante ou accès RPC direct (voir fichier 11 pour node providers tiers en alternative).

## Pourquoi ce fichier peut être utile même sans construire d'infra soi-même

Si le projet consiste à **consommer** Arc (via l'App Kit ou des appels RPC directs) plutôt qu'à fournir un service d'infrastructure, ce fichier sert surtout de check-list de compréhension : savoir ce que fait "correctement" un wallet ou un exchange aide à repérer les pièges côté application aussi (ex. afficher les frais en USDC et pas en Gwei, ne pas confondre solde natif/ERC-20 dans l'UI).
