# 03 : Adresses de contrats de référence

Source : `docs.arc.io/arc/references/contract-addresses`. **À revérifier sur la doc officielle avant tout usage réel** (les adresses peuvent évoluer, surtout côté testnet).

## Stablecoins

### USDC : actif natif EVM, sert aussi de gas
| Réseau | Adresse (interface ERC-20) | Décimales |
|---|---|---|
| Mainnet | `0x3600000000000000000000000000000000000000` | 6 (ERC-20) / 18 (natif) |
| Testnet | `0x3600000000000000000000000000000000000000` | idem |

Pas d'adresse "wrapped USDC" : inutile, voir fichier 02. Faucet testnet : `faucet.circle.com`.

### EURC : stablecoin euro
| Réseau | Adresse |
|---|---|
| Mainnet | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` |
| Testnet | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |

6 décimales. Faucet testnet disponible (sélectionner "EURC" sur `faucet.circle.com`).

### USYC : token de rendement (fonds monétaire tokenisé)
| Contrat | Mainnet | Testnet |
|---|---|---|
| USYC | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| Entitlements | `0xb69ecb156Dc0028198028c501340d5367845ca72` | `0xcc205224862c7641930c87679e98999d23c26113` |
| Teller (mint/redeem contre USDC) | `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b` | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |

⚠️ Réservé aux institutions hors des États-Unis, ticket d'entrée minimum 100 000 $, allowlisting requis (ticket support Circle, 24–48h). Peu pertinent en phase d'exploration/POC.

## Crosschain (CCTP : Cross-Chain Transfer Protocol)

Domaine Arc = **26**.

| Contrat | Mainnet | Testnet |
|---|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xfd78EE919681417d192449715b2594ab58f5D002` | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| MessageV2 | `0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78` | `0xbaC0179bB358A8936169a63408C8481D582390C4` |

## Gateway (solde unifié crosschain)

| Contrat | Mainnet | Testnet |
|---|---|---|
| GatewayWallet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

## Paiements et règlement

### StableFX (moteur FX RFQ + règlement onchain)
| Contrat | Mainnet | Testnet |
|---|---|---|
| FxEscrow | `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6` | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |

⚠️ Avant de trader via StableFX, il faut approuver le contrat **Permit2** (voir plus bas) pour que StableFX puisse transférer l'USDC du wallet.

## Extensions de transaction (préservent `msg.sender` via le précompilé CallFrom)

| Contrat | Adresse (identique mainnet/testnet) | Rôle |
|---|---|---|
| Memo | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Attache des métadonnées mémo aux appels, émet des events `Memo` indexés |
| Multicall3From | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | Regroupe plusieurs appels (comme Multicall3) en préservant le `msg.sender` d'origine dans chaque sous-appel |

⚠️ Pour un système de blocklist/conformité offchain : ces deux contrats doivent être inclus dans la surveillance, car ils font apparaître l'appelant d'origine comme expéditeur dans les sous-appels.

## Contrats Ethereum communs (déployés sur Arc pour compatibilité tooling)

| Contrat | Adresse (identique mainnet/testnet) | Rôle |
|---|---|---|
| CREATE2 Factory (Arachnid) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | Déploiement déterministe |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | Agrégation de lectures |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Approbations par signature : **requis pour StableFX** |

## Adresse de test pour la blocklist (testnet uniquement)

Dérivée de la mnémonique publique standard `test test test test test test test test test test test junk`, index 1 :
`0x70997970C51812dc3A010C7d01b50e0d17dc79C8` : tout transfert de valeur vers/depuis cette adresse revert (y compris comme bénéficiaire d'un `SELFDESTRUCT`). Utile pour tester la gestion des reverts liés à la blocklist côté contrat.
