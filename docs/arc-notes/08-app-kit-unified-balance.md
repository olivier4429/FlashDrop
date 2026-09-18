# 08 — App Kit : Unified Balance (solde unifié)

Source : `docs.arc.io/app-kit/unified-balance`.

## Concept

Combine l'USDC détenu sur **plusieurs blockchains** en **un seul solde chain-agnostic**, immédiatement dépensable sur n'importe quelle chaîne. Construit au-dessus de **Circle Gateway**, qui gère le workflow de dépôt/dépense entre chaînes EVM et non-EVM.

```
Wallet Chaîne A ─┐
Wallet Chaîne B ─┼─→ dépôts → [ Unified Balance ] → dépense → Wallet Chaîne D
Wallet Chaîne C ─┘
```

## Ce qu'il faut savoir sur les modèles de wallet

- **Certains wallets ne peuvent pas signer eux-mêmes leurs dépenses Unified Balance** (ex. Circle Wallets SCA, Privy server wallets). Solution : le **workflow delegate** — le wallet reste le déposant, mais un EOA autorisé signe chaque dépense.
- **Les Circle Wallets sont spécifiques à une chaîne** : pour un flux multi-chaînes sources, il faut l'adresse du wallet pour chaque chaîne source concernée.
- Pour les dépenses, créer une source par wallet+chaîne selon le besoin ; l'adaptateur Circle Wallets est stateless (réutilisable, adresse passée à chaque appel).
- Les dépôts SCA (Circle Wallets) nécessitent `allowanceStrategy: "approve"` — les signatures permit USDC utilisent `ecrecover`, qui n'accepte pas les signatures ERC-1271 des SCA, donc le SDK bascule sur un `approve` onchain classique.

## Exemple de code
```typescript
// Dépôt de 1.00 USDC depuis Base
const depositBase = await kit.unifiedBalance.deposit({
  from: { adapter: viemAdapter, chain: "Base_Sepolia" }, amount: "1.00", token: "USDC",
});
// Dépôt de 1.00 USDC depuis Arbitrum
const depositArb = await kit.unifiedBalance.deposit({
  from: { adapter: viemAdapter, chain: "Arbitrum_Sepolia" }, amount: "1.00", token: "USDC",
});
// Dépense de 1.50 USDC vers Arc
const spendResult = await kit.unifiedBalance.spend({
  amount: "1.50", from: { adapter: viemAdapter },
  to: { adapter: viemAdapter, chain: "Arc_Testnet", recipientAddress: "0xRecipientAddress" },
});
```

## Installation (si seul Unified Balance est nécessaire, sans l'App Kit complet)
```bash
npm install @circle-fin/unified-balance-kit
# + un adaptateur selon le wallet utilisé :
npm install @circle-fin/adapter-viem-v2 viem            # Viem
npm install @circle-fin/adapter-ethers-v6 ethers         # Ethers
npm install @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js  # Solana
npm install @circle-fin/adapter-circle-wallets            # Circle Wallets
```

## Quickstarts officiels
- **Deposit and spend a Unified Balance** — flux de base.
- **Use a delegate to deposit and spend a Unified Balance** — quand le wallet ne peut pas signer lui-même ses dépenses.

## À surveiller en production
La doc renvoie vers le **Gateway implementation checklist** (`developers.circle.com/gateway`) pour les considérations de production liées aux dépôts, dépenses, et retrait de fonds — à consulter avant tout déploiement réel touchant de vrais fonds.

## Lien avec le fichier 04 (release notes vues en communauté)
Une amélioration mentionnée côté communauté (article "Fund Gateway from Slow-Finality Chains with Fast Deposits") : les **Fast Gateway Deposits** permettent de financer un solde unifié en moins d'une minute même depuis une chaîne à finalité lente (Ethereum/Base/Arbitrum mettent normalement 13-19 min), via `config.transferSpeed: "FAST"` — un relayer gère le dépôt Gateway de destination. Jusqu'à 40x plus rapide sur les routes éligibles. Voir fichier 12 pour le contexte communautaire complet.
