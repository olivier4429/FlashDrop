# 06 — App Kit : vue d'ensemble

Source : `docs.arc.io/app-kit`.

## Concept

**App Kits** = suite de SDK pour composer des flux de paiement et de liquidité multi-chaînes, sans avoir à intégrer séparément chaque protocole bas niveau pour chaque blockchain. Ce n'est **pas propre à Arc** : ça fonctionne à travers plusieurs chaînes EVM, Solana, et les Circle Wallets — Arc est une des destinations possibles.

Deux façons d'installer :
- **App Kit SDK** (package "tout-en-un") : accès à toutes les capacités (Send, Bridge, Swap, Unified Balance, Onramp, Earn) derrière une seule interface typée.
- **Kits individuels** : Bridge Kit, Swap Kit, Unified Balance Kit, Onramp Kit, Earn Kit installables séparément si un seul besoin.

### Installation rapide (App Kit SDK + adaptateur Viem)
```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem
```
D'autres adaptateurs existent (Ethers, Solana, Circle Wallets) — voir fichier 07/08 pour le détail des installs par capacité.

## Les 6 capacités

| Capacité | Rôle |
|---|---|
| **Bridge** | Transférer USDC/EURC entre blockchains |
| **Swap** | Échanger un token contre un autre, même chaîne ou crosschain |
| **Send** | Transférer des tokens entre wallets sur la même chaîne |
| **Unified Balance** | Solde chain-agnostic, dépensable instantanément partout |
| **Onramp** | Widget embarqué pour acheter des stablecoins avec du fiat |
| **Earn** | Déposer USDC/EURC dans des protocoles de prêt pour générer du rendement |

## Bénéfices clés mis en avant

- **Setup simple** — peu de configuration, quelques lignes de code.
- **Monétisation applicative** — possibilité de prélever des frais custom sur l'utilisateur final sans code additionnel.
- **Configuration flexible** — endpoints RPC et wallet clients personnalisables.
- **Compatibilité large** — Viem, Ethers, Solana, Circle Wallets.
- **Abstraction de protocole** — une seule interface au-dessus de Gateway et CCTP.
- **Workflows composables** — combiner plusieurs capacités dans un même flux produit.

## Aperçu rapide (une ligne de code par capacité)

```typescript
// Bridge — transférer 1.00 USDC d'Ethereum vers Arc
await kit.bridge({
  from: { adapter: viemAdapter, chain: "Ethereum_Sepolia" },
  to:   { adapter: viemAdapter, chain: "Arc_Testnet" },
  amount: "1.00",
});

// Swap — échanger 1.00 USDC contre EURC sur Arc Testnet
await kit.swap({
  from: { adapter: viemAdapter, chain: "Arc_Testnet" },
  tokenIn: "USDC", tokenOut: "EURC", amountIn: "1.00",
  config: { kitKey: process.env.KIT_KEY as string }, // clé obtenue via la Circle Console
});

// Send — envoyer 1.00 USDC entre wallets sur Arc Testnet
await kit.send({
  from: { adapter: viemAdapter, chain: "Arc_Testnet" },
  to: "RECIPIENT_ADDRESS", amount: "1.00", token: "USDC",
});

// Unified Balance — déposer depuis 2 chaînes, dépenser sur une 3e
await kit.unifiedBalance.deposit({ from: { adapter: viemAdapter, chain: "Base_Sepolia" }, amount: "1.00", token: "USDC" });
await kit.unifiedBalance.deposit({ from: { adapter: viemAdapter, chain: "Arbitrum_Sepolia" }, amount: "1.00", token: "USDC" });
await kit.unifiedBalance.spend({
  from: { adapter: viemAdapter }, amountIn: "1.50",
  to: { adapter: viemAdapter, chain: "Arc_Testnet", recipientAddress: "0xRecipientAddress" },
});

// Onramp — session serveur puis widget embarqué
const session = await kit.onramp.fetchSession({ url: "/api/onramp/sessions", body: { userId: "user-123", destinationAddress: "USER_WALLET_ADDRESS" } });
kit.onramp.mountIframe({ session, container: document.getElementById("onramp-root")! });

// Earn — déposer 100.00 USDC dans un vault sur Arc
await kit.earn.deposit({
  from: { adapter: viemAdapter, chain: "Arc_Testnet" },
  vaultAddress: "0xVaultAddress", amount: "100.00",
});
```

Chaque capacité a son propre quickstart officiel détaillé (référencés dans les fichiers 07-09).

Note importante : `KIT_KEY` provient de la **Circle Console** — un compte/projet Circle est donc un prérequis pour certains flux (notamment Swap), à anticiper côté organisation/onboarding.
