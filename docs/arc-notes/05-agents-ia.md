# 05 — Agents IA et économie agentique

Sources : `docs.arc.io/build/agentic-economy`, `/ai/mcp`.

## Économie agentique — concept

Idée : permettre à des agents IA autonomes d'agir comme des **participants économiques de premier ordre** — s'enregistrer, trouver du travail, être payés, sans intervention humaine à chaque étape. Deux standards ouverts (ERC = Ethereum Request for Comment, des propositions de standard) portent ce cas d'usage :

- **ERC-8004** — identité et réputation onchain pour un agent. Un registre natif permet à un agent de s'enregistrer, d'accumuler des événements de réputation, et de faire vérifier ses "credentials" (justificatifs).
- **ERC-8183** — cycle de vie complet d'un "job" programmable : création → financement en escrow (USDC) → soumission d'un livrable → évaluation → règlement.

### Pourquoi Arc convient à ce cas d'usage
- **Finalité sub-seconde** : un agent a besoin d'une confirmation rapide et déterministe pour clore un job et libérer les fonds.
- **Règlement natif en USDC** : les agents transigent dans une unité de compte stable, sans gérer de token de gas volatil.
- **Conformité native** : points d'intégration pour la surveillance de transactions (Elliptic, TRM Labs — fichier 11), important pour du transfert de valeur agent-à-agent à grande échelle.
- **Tooling EVM standard** : n'importe quel SDK compatible EVM (ethers.js, viem, web3.py) fonctionne pour qu'un agent interagisse avec des contrats Arc.

### Exemples d'applications de référence (GitHub, à forker)
- **Arc escrow** — validation de travail assistée par IA + règlement USDC automatisé (Circle Wallets, Refund Protocol, Contract Platform).
- **Arc nanopayments** — un agent IA autonome paie des endpoints API premium en fractions d'USDC via Circle Nanopayments et le protocole x402.

### Parcours suggéré (quickstarts officiels)
1. **Register your first AI agent** (débutant) — enregistrer l'identité d'un agent, construire sa réputation, vérifier des credentials via ERC-8004.
2. **Create your first ERC-8183 job** (intermédiaire) — créer un job, financer l'escrow en USDC, soumettre un livrable, exécuter le règlement.

Ces deux tutoriels ne sont pas encore récupérés en détail dans ces notes — à faire quand ce sujet devient concret pour le projet.

## Serveur MCP Arc — coder assisté par IA sur la doc Arc

Un serveur **Model Context Protocol** hébergé par Circle donne à des outils IA (Claude Code, Claude Desktop, Cursor, VS Code/Copilot, Windsurf...) un accès direct à la documentation Arc pendant une conversation.

- URL : `https://docs.arc.io/mcp` — **aucune authentification requise**.
- Deux capacités exposées : **recherche** (snippets pertinents selon une requête) et **récupération de page complète**.

### Configuration — Claude Code
```bash
claude mcp add --transport http arc-docs https://docs.arc.io/mcp
```

### Configuration — Claude Desktop
Paramètres → Connecteurs → Ajouter un connecteur personnalisé → nom `Arc Docs`, URL `https://docs.arc.io/mcp`. Puis sélectionner ce connecteur via le bouton pièce-jointe pendant une conversation.

### Configuration — Cursor (`mcp.json`)
```json
{ "mcpServers": { "arc-docs": { "url": "https://docs.arc.io/mcp" } } }
```

### Configuration — VS Code / Copilot (`.vscode/mcp.json`)
```json
{ "servers": { "arc-docs": { "type": "http", "url": "https://docs.arc.io/mcp" } } }
```

### Configuration — Windsurf
```json
{ "mcpServers": { "arc-docs": { "serverUrl": "https://docs.arc.io/mcp" } } }
```

### Vérifier la connexion
Poser une question à l'outil IA du type *"Quels standards de smart contracts Arc supporte-t-il ?"* — la réponse doit citer du contenu issu de la doc Arc. En cas d'échec : vérifier l'URL exacte (sans slash final), l'accès réseau HTTPS, et redémarrer le client (certains ne détectent un nouveau serveur MCP qu'au redémarrage).

## Complément — skill officielle Circle pour agents de code

Le fichier index `docs.arc.io/llms.txt` recommande d'installer une **skill Circle** avant de commencer à coder avec un agent :

- Claude Code : `/plugin marketplace add circlefin/skills` puis `/plugin install circle-skills@circle`
- Vercel Skills CLI : `npx skills add circlefin/skills`

Cette skill `use-arc` couvre : config de chaîne, setup RPC, déploiement de contrats, bridging USDC, gas en USDC. D'autres skills Circle existent pour les produits associés (wallets, Gateway, smart contracts) — utile si le projet dépasse le seul périmètre Arc.
