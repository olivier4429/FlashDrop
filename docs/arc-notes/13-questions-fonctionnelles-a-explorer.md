# 13 : Questions fonctionnelles à explorer

Espace de travail pour noter les questions qui se posent en lisant les fichiers 01-12, avant de passer au développement. À compléter au fil de la réflexion : chaque question peut donner lieu à une nouvelle recherche ciblée dans la doc source ou à une discussion.

## Cadrage général du projet

- [ ] Quel est le cas d'usage précis visé pour Jalios sur Arc (paiement, FX, agentique, autre) ? Le fichier 12 mentionne plusieurs familles de cas d'usage côté docs.arc.io (peer-to-peer, eCommerce, FX, agentique, prediction markets, lending) : lequel colle le mieux ?
- [ ] S'agit-il de construire une application qui *utilise* Arc (via App Kit / RPC), ou d'intégrer Arc dans un produit existant (wallet, plateforme, service) ?
- [ ] Mainnet ou testnet pour la phase d'exploration ? (le tutoriel de déploiement, fichier 04, est calé sur testnet)
- [ ] Faut-il un compte/projet Circle (Console) pour obtenir une `kitKey` (nécessaire pour Swap notamment, fichier 06) ?

## Modèle stablecoin / gas (fichier 02)

- [ ] Comment le code applicatif doit-il gérer la double interface USDC (natif 18 décimales / ERC-20 6 décimales) dans nos propres calculs (facturation, affichage, comptabilité) ?
- [ ] Le produit a-t-il besoin de sponsoriser le gas pour les utilisateurs finaux (paymaster / account abstraction, fichier 11) ?
- [ ] Y a-t-il un risque de blocklist à anticiper dans le parcours utilisateur (transaction qui revert silencieusement, fichier 02) ?

## Architecture / infra (fichiers 01, 10, 11)

- [ ] RPC : nœud géré par un tiers (Alchemy, QuickNode...) ou RPC public Arc suffisant pour la phase de test ?
- [ ] Besoin d'indexation d'événements onchain (historique de transactions, tableau de bord) ? Si oui, quel indexeur (Envio, Goldsky, The Graph, Thirdweb) ?
- [ ] Besoin de conformité (screening de wallets, blocklist) dès la phase de POC, ou seulement en production ?

## App Kit (fichiers 06-09)

- [ ] Quelles capacités sont réellement nécessaires : Send seul suffit-il, ou faut-il Bridge/Unified Balance pour gérer des fonds venant de plusieurs chaînes ?
- [ ] Onramp est-il pertinent (utilisateurs qui n'ont pas encore de stablecoins) ou tous les utilisateurs cibles ont-ils déjà de l'USDC ?
- [ ] Earn a-t-il un intérêt produit (rendement pour l'utilisateur final) ou est-ce hors périmètre ?

## Agents IA (fichier 05)

- [ ] Le projet a-t-il une dimension agentique (agents autonomes qui paient/sont payés) ou est-ce un sujet à explorer plus tard ?
- [ ] Le serveur MCP Arc (fichier 05) peut-il être activé dès maintenant dans l'environnement de dev de l'équipe pour accélérer l'apprentissage du code (Claude Code, Cursor...) ?

## Gouvernance / relation avec Circle (fichier 12)

- [ ] Le programme "Architects" est-il pertinent pour Jalios (accompagnement, financement via Arc Builders Fund) ?
- [ ] Faut-il suivre les canaux communautaires (community.arc.io) pour rester informé des évolutions (le mainnet vient de sortir, la doc et les adresses peuvent encore bouger) ?

## Points de vigilance transverses (à ne pas perdre de vue)

- Le mainnet est **très récent** (annoncé le 16-17 septembre 2026) : vérifier systématiquement qu'une information n'est pas encore une valeur "testnet uniquement" avant de l'utiliser en production. ✅ Chain ID désormais confirmé et non ambigu : **5042 = mainnet, 5042002 = testnet**, ce sont deux réseaux distincts et actifs en parallèle (voir fichier 01, mis à jour le 17/09/2026).
- Toujours repartir de `docs.arc.io/llms.txt` pour retrouver la liste à jour des pages si une info semble périmée : **mais attention** : au 17/09/2026, `llms.txt` et la page "Gas and fees" contiennent encore des mentions périmées ("Arc is currently available on Testnet only", "values may change before mainnet launch") alors que le mainnet est live. La doc source elle-même a un train de retard post-lancement : ne pas prendre ces mentions-là pour argent comptant, croiser avec `/arc/references/connect-to-arc` (qui, lui, a bien les deux onglets Mainnet/Testnet à jour).
- **Nouveau (17/09/2026)** : la page `/build/agentic-economy` référence deux liens pas encore publiés : `/build/payments` (P2P Payments) et `/build/ecommerce` (eCommerce Checkout), qui redirigent aujourd'hui vers la page Build générique. Cela suggère que Circle prépare des pages "Build" organisées par cas d'usage (paiement, e-commerce, FX, agentique...) plutôt que par brique technique : à re-vérifier périodiquement, ça pourrait à terme réorganiser une partie du contenu des fichiers 02-09.
- **Nouveau (17/09/2026)** : le fichier 02 contient désormais l'adresse exacte de l'émetteur système EIP-7708 (`0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`) et les `topic0` associés : utile si un besoin d'indexation devient concret, plus la peine d'aller rechercher `/arc/references/usdc-system-events` à ce moment-là.
