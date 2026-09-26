# 09 : App Kit : Onramp et Earn

Source : index `docs.arc.io/llms.txt` (descriptions officielles ; détail complet à récupérer page par page si ces capacités deviennent prioritaires).

## Onramp : achat de stablecoins avec du fiat

Widget embarqué permettant à un utilisateur d'acheter des stablecoins sur Arc directement avec de la monnaie fiduciaire.

| Page | Contenu |
|---|---|
| App Kit: Onramp (`/app-kit/onramp`) | Vue d'ensemble |
| Quickstart: Embed the Onramp widget | Route de session côté serveur + montage iframe inline |
| Customize session minting | Authentification, scope des actifs, autorisation d'intégration de la page |
| Choose iframe or popup mode | `mountIframe` vs `openWindow`, avec fallback |
| Handle lifecycle events | S'abonner aux événements du widget |
| Hosting requirements | Endpoints, sandbox, CSP, règles de conteneur |
| Error handling | Champs `KitError`, correspondance avec les codes HTTP |

Exemple minimal (vu fichier 06) :
```typescript
const session = await kit.onramp.fetchSession({
  url: "/api/onramp/sessions",
  body: { userId: "user-123", destinationAddress: "USER_WALLET_ADDRESS" },
});
const widget = kit.onramp.mountIframe({ session, container: document.getElementById("onramp-root")! });
```
Point d'attention : la session se crée **côté serveur** (endpoint à exposer), le widget se monte ensuite côté client.

## Earn : rendement sur dépôts USDC/EURC

Dépôt dans des vaults générant du rendement via des protocoles de prêt tiers.

| Page | Contenu |
|---|---|
| App Kit: Earn (`/app-kit/earn`) | Vue d'ensemble |
| Quickstart: Deposit into an Earn vault | Découverte de vaults + dépôt |
| Quickstart: Withdraw from an Earn vault | Rachat des parts de vault contre de l'USDC |
| How to: Check your Earn position | Consulter solde et rendement |
| How to: Preview Earn operations | Obtenir un devis avant de soumettre un dépôt/retrait |
| How to: Deposit crosschain into an Earn vault | Déposer depuis une chaîne vers un vault sur une autre |
| How Earn fees work | Frais de vault et de retrait |
| Earn Error Handling | Erreurs, retries, limites de taux |

Exemple minimal :
```typescript
await kit.earn.deposit({
  from: { adapter: viemAdapter, chain: "Arc_Testnet" },
  vaultAddress: "0xVaultAddress", amount: "100.00",
});
```

## Questions à creuser avant d'implémenter

- **Onramp** : quel fournisseur fiat est utilisé en arrière-plan ? Quelles zones géographiques et quels moyens de paiement sont supportés ? Quelles obligations KYC pèsent sur l'intégrateur ?
- **Earn** : quels protocoles de prêt sous-jacents alimentent les vaults ? Quel est le risque de contrepartie/smart contract associé ? Le rendement est-il variable ou fixe, et à quelle fréquence est-il capitalisé ?
