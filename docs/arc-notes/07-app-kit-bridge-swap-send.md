# 07 : App Kit : Bridge, Swap, Send

Source : index `docs.arc.io/llms.txt` (résumés officiels des pages ; contenu détaillé de chaque page à récupérer au besoin quand ces capacités deviennent concrètes pour le projet).

## Bridge : transférer des tokens entre blockchains

- **App Kit: Bridge** (`/app-kit/bridge`) : transférer de l'USDC entre chaînes.
- **Quickstart: Bridge Tokens** (`/app-kit/quickstarts/bridge-tokens-across-blockchains`) : bridger entre chaînes EVM, Solana, et Circle Wallets.
- **Bridge Fees** (`/app-kit/concepts/bridge-fees`) : détail de la structure de frais.
- **Error Recovery** (`/app-kit/references/bridge-error-recovery`) : dépannage des bridges échoués.

Exemple d'appel (voir fichier 06) :
```typescript
await kit.bridge({
  from: { adapter: viemAdapter, chain: "Ethereum_Sepolia" },
  to:   { adapter: viemAdapter, chain: "Arc_Testnet" },
  amount: "1.00",
});
```
Repose sur **CCTP** (Cross-Chain Transfer Protocol) : voir fichier 03 pour les adresses des contrats CCTP sur Arc (domaine 26).

## Swap : échanger un token contre un autre

- **App Kit: Swap** (`/app-kit/swap`) : swaps sur la même chaîne.
- **Quickstart: Same-Chain Swap** (`/app-kit/quickstarts/swap-tokens-same-chain`).
- **Quickstart: Crosschain Swap** (`/app-kit/quickstarts/swap-tokens-crosschain`) : swap + bridge combinés.
- **Swap Fees** (`/app-kit/concepts/swap-fees`) : détail des frais.

Nécessite une `kitKey` (Circle Console) : voir exemple fichier 06.

## Send : transfert simple entre wallets, même chaîne

- **App Kit: Send** (`/app-kit/send`) : wallet-à-wallet sur la même chaîne.
- **Quickstart: Send Tokens** (`/app-kit/quickstarts/send-tokens-same-chain`).

C'est la capacité la plus simple des trois : pas de logique crosschain, pas de swap de token, juste un transfert direct.

## Questions à creuser avant d'implémenter

- Quel est le montant réel des frais Bridge vs Swap vs Send (à comparer selon le cas d'usage : un simple virement interne n'a probablement pas besoin de Bridge) ?
- Le crosschain swap (bridge + swap) a-t-il une latence significativement plus longue que le swap simple, à cause du délai de finalité de la chaîne source (voir fichier 02, "Gas et frais" et la doc Gateway pour les dépôts rapides) ?
- Faut-il gérer l'échec partiel d'un bridge (le guide "Error Recovery" est fait pour ça : à lire en détail avant la mise en prod).
