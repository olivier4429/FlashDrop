# 02 — Modèle stablecoin natif, gas et différences avec l'EVM standard

Sources : `docs.arc.io/arc/concepts/stablecoin-native-model`, `/arc/concepts/stable-fee-design`, `/arc/references/gas-and-fees`, `/arc/references/evm-differences`, `/arc/references/usdc-system-events`.

> **Mise à jour du 17/09/2026** — Fichier revérifié contre les pages live de `docs.arc.io`. Deux ajouts principaux depuis la première rédaction : le détail complet des adresses d'émetteur des événements `Transfer` (section dédiée ci-dessous, absente de la version précédente), et deux précisions sur le fee market (publication de la base fee dans `extra_data`, non-stricte croissance des timestamps).

C'est **le fichier le plus important à comprendre avant de coder** : Arc a des règles d'exécution qui diffèrent d'Ethereum, et les ignorer casse des hypothèses DeFi classiques.

## Pourquoi pas de token volatil natif ?

Sur la plupart des chaînes EVM, un token volatil (ETH) sert à la fois de carburant (gas) et d'actif natif. Arc remplace ce rôle par l'USDC : chaque frais de transaction, chaque solde natif, chaque transfert natif est libellé en USDC. Conséquences : les frais sont prévisibles en dollars, un seul actif à détenir pour le gas et les usages applicatifs, pas de token à acquérir séparément.

Design volontaire à 3 niveaux :
1. **Pas de token volatil natif** — élimine la friction d'acquisition/gestion d'exposition au prix.
2. **Un seul dénominateur de gas au lancement** — l'USDC uniquement (pas encore de paiement de gas multi-stablecoins via paymaster).
3. **Stablecoins comme primitives de premier ordre** — USDC, EURC, USYC sont intégrés au niveau protocole (pré-déployés à la genèse), pas ajoutés après coup ni pontés depuis une autre chaîne.

## Le modèle à deux interfaces (point critique)

L'USDC sur Arc a **deux interfaces qui partagent le même solde sous-jacent** :

| Interface | Décimales | Usage |
|---|---|---|
| **Native** | 18 | comptabilité du gas, envois natifs, `msg.value` |
| **ERC-20** | 6 | transferts applicatifs, `approve`, `allowance` — adresse `0x3600000000000000000000000000000000000000` |

Il n'existe **pas de wrapper façon WETH** : l'USDC natif a déjà nativement une interface ERC-20 (`IERC20`), donc pas besoin d'étape de wrapping. Ne pas confondre non plus avec le sentinel EIP-7528 (`0xEeee...EeE`) que certains SDK DeFi utilisent comme substitut d'ETH natif — l'aliasing casserait la distinction native/ERC-20.

**Piège fréquent** : `USDC.balanceOf(addr)` (6 décimales) et `addr.balance` (18 décimales) représentent **le même solde**. L'interface ERC-20 tronque les 12 dernières décimales : un solde `balanceOf` à zéro ne veut pas dire un solde natif à zéro (les montants < 10⁻⁶ USDC existent en natif mais n'apparaissent pas côté ERC-20). Ne jamais mélanger les deux valeurs brutes dans un calcul (ex. dans un pool AMM ou du calcul LTV) : elles sont décalées d'un facteur 10¹².

**Un transfert natif peut échouer même avec un solde suffisant** — voir règles de transfert de valeur ci-dessous.

## Design des frais : lissage EWMA

Arc part d'EIP-1559 mais remplace le recalcul de base fee par bloc par une **moyenne mobile exponentiellement pondérée (EWMA)** de l'utilisation des blocs. Un pic de demande ponctuel ne fait donc pas exploser les frais d'un coup ; à l'inverse une série de blocs vides ne les fait pas chuter aussi vite.

```
utilization_ewma(n) = alpha * block_utilization(n) + (1 - alpha) * utilization_ewma(n-1)
base_fee(n) = adjust(base_fee(n-1), utilization_ewma(n-1), target_utilization)  # borné [min, max]
```

| Paramètre | Valeur (config testnet actuelle) |
|---|---|
| Cible de base fee | ~0,001 $ par transfert ERC-20 |
| Base fee minimum (testnet) | 20 Gwei — **transactions en dessous silencieusement droppées par le mempool, sans erreur** |
| Base fee maximum | 20 000 Gwei (plafond dur) |
| Débit gas | 30M gas/bloc (~60M gas/sec à 0,5s/bloc) |

Différence notable avec Ethereum : **la base fee n'est pas brûlée**, elle est créditée au bénéficiaire du bloc (comme le tip).

Deux précisions techniques utiles pour un backend qui lit les headers directement :
- **La base fee du prochain bloc est publiée dans le champ `extra_data` du header du bloc parent**, encodée en big-endian sur 8 octets — lisible directement sans appel RPC supplémentaire (`eth_gasPrice`/`eth_feeHistory` restent l'approche recommandée côté applicatif, voir tableau des erreurs plus bas).
- **Les timestamps de bloc sont non décroissants, mais pas strictement croissants** : ils viennent de l'horloge murale du proposeur au tick de la seconde, donc plusieurs blocs sub-seconde peuvent partager le même timestamp. Ne jamais utiliser `block.timestamp` pour ordonner des blocs/événements — utiliser le numéro de bloc.

Pour les tips : mettre `maxPriorityFeePerGas` à 0 suffit la plupart du temps ; interroger `eth_maxPriorityFeePerGas` pour une valeur recommandée en cas de congestion.

### Erreurs courantes de soumission de transaction

| Erreur | Cause | Solution |
|---|---|---|
| `transaction underpriced` | `maxFeePerGas` < 20 Gwei | Mettre au moins 20 Gwei |
| `intrinsic gas too low` | Gas limit trop bas | ≥21000 pour un simple transfert, sinon `eth_estimateGas` |
| `insufficient funds for gas * price + value` | Solde USDC insuffisant pour couvrir valeur + frais | Financer le compte |

Toujours **afficher les frais en USDC** côté utilisateur, jamais en Gwei brut.

## Différences protocolaires avec l'EVM (Ethereum "Osaka" comme référence)

Arc cible le hard fork **Osaka** comme base, avec certaines fonctionnalités du futur hard fork **Amsterdam** en avance (notamment EIP-7708, voir plus bas).

| Comportement | Ethereum (Osaka) | Arc |
|---|---|---|
| `PREVRANDAO` | Mix RANDAO de la beacon chain | Toujours `0` — pas de source d'aléa onchain, utiliser un oracle/VRF |
| `SELFDESTRUCT` | EIP-6780 | EIP-6780 + règles de valeur native, émet un `Transfer` en cas de succès (voir plus bas) |
| Appel `CALL` non-zéro vers un compte autodétruit | Réussit | **Revert** (transfert vers compte détruit = "burn" interdit) — plus gros écart sémantique |
| `parentBeaconBlockRoot` (EIP-4788) | Retourne la racine beacon parente | Fixé au hash du bloc d'exécution parent ; le contrat beacon-roots est absent (lecture vide) |
| Transactions blob (EIP-4844, type-3) | Supportées | **Non supportées**, rejetées par le mempool ; `BLOBHASH`→0, `BLOBBASEFEE`→1 |
| Retraits (EIP-4895) | Peuvent être présents | Toujours vides |

EIP-7702 (set-code), `CREATE2`, EIP-2935 (historique des block hashes) se comportent comme sur Ethereum.

### Règles de transfert de valeur (spécifiques à Arc)

Un transfert natif peut revert **même avec un solde suffisant** :
- **Transfert vers l'adresse zéro interdit** (sauf transfert de valeur nulle) — revert `"Zero address not allowed"`.
- **Le burn est interdit** — s'autodétruire vers soi-même avec un solde, ou transférer vers un compte déjà autodétruit, revert.
- **Blocklist appliquée au runtime** — un transfert vers/depuis une adresse blocklistée revert (et **consomme le gas** même en cas de revert).
- **Envoyer de la valeur native à un contrat n'est pas garanti** — peut revert pour n'importe laquelle des raisons ci-dessus, ce qui casse une hypothèse DeFi courante.
- Envoyer vers une adresse sans code (EOA) réussit et émet un `Transfer`. Envoyer vers un précompilé revert.

⚠️ **Une pool de liquidité qui pairerait "USDC natif" contre l'interface ERC-20 USDC n'a aucun sens** — c'est le même actif.

### `SELFDESTRUCT` — 3 comportements à retenir

1. Autodétruire un contrat qui détient de l'USDC **déplace réellement cet USDC** (contrairement à Ethereum où l'ERC-20 vit dans le contrat token, indépendant du solde natif du contrat autodétruit).
2. Un appel non-zéro vers un contrat autodétruit **plus tôt dans la même transaction** revert sur Arc (réussit sur Ethereum).
3. Un autodestruct réussi qui déplace un solde émet un log `Transfer` (EIP-7708) — à indexer comme n'importe quel mouvement natif.

### Événements `Transfer` natifs (EIP-7708)

Sur un EVM standard, un envoi natif simple n'émet aucun log. Sur Arc, **chaque mouvement d'USDC natif émet un log `Transfer` standard ERC-20 depuis une adresse système** — couvrant envois natifs, dotations de contrat, transferts par autodestruction, opérations via précompilé. Les déductions de gas n'émettent pas de log (le déduire du reçu de transaction).

Le contrat ERC-20 USDC émet **en plus** son propre `Transfer` (6 décimales) pour l'activité côté interface ERC-20 : un simple transfert ERC-20 émet donc **deux logs** — matcher sur l'adresse de l'émetteur pour éviter le double comptage à l'indexation.

### Détail des deux flux d'événements (page dédiée `usdc-system-events`)

Référence exacte à utiliser pour tout travail d'indexation — les deux flux sont **indépendants**, filtrer par adresse d'émetteur :

| Source | Adresse émettrice | Événement | Décimales | topic0 |
|---|---|---|---|---|
| **USDC natif (système, EIP-7708)** | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | `Transfer` | 18 | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |
| **USDC ERC-20 (NativeFiatToken)** | `0x3600000000000000000000000000000000000000` | `Transfer` | 6 | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |

Règles précises du log système (natif) :
- Il est **toujours émis en premier** dans la transaction, avant tout autre log.
- **Aucun log si le transfert est de valeur nulle**, et **aucun log en cas de self-transfer** (`from == to`).
- Mint = `Transfer(0x0, destinataire, montant)` ; burn = `Transfer(source, 0x0, montant)` — ce sont les seuls cas où `0x0` apparaît (mint/burn passent par le précompilé natif ; un `CALL`/`CREATE`/`SELFDESTRUCT` normal vers `0x0` revert, voir plus haut).
- Les **déductions de gas et les récompenses de bloc** n'émettent jamais de `Transfer` — à déduire du reçu de transaction (`gasUsed × effectiveGasPrice`) et de `block.miner`, respectivement.

⚠️ **Événements historiques (testnet, avant le hard fork "Zero5")** : avant l'activation de ce hard fork, les mouvements natifs émettaient des événements custom depuis le précompilé `NativeCoinAuthority` (`0x1800000000000000000000000000000000000000`, 18 décimales) au lieu du `Transfer` standard EIP-7708 :

| Événement legacy | topic0 |
|---|---|
| `NativeCoinTransferred(from, to, amount)` | `0x62f084c00a442dcf51cdbb51beed2839bf42a268da8474b0e98f38edb7db5a22` |
| `NativeCoinMinted(recipient, amount)` | `0xb049859d09b3a7d0189a07db4d4becee1a2aa269023205478b1360ab6fc12114` |
| `NativeCoinBurned(from, amount)` | `0xaaf1ef013644e67c5cea90217acdf0accd334f8437fc9a89a53cfc9b25fb5c25` |

Ces événements ne sont plus émis après activation. **Le mainnet utilise le `Transfer` EIP-7708 depuis la genèse** — ce point ne concerne donc que le backfill d'historique testnet antérieur à l'activation. Pour la date exacte d'activation et les prérequis de version de nœud : `CHANGELOG.md` et `BREAKING_CHANGES.md` du repo `circlefin/arc-node`.

## Ce qu'il faut vérifier avant de porter un contrat existant

- Le contrat manipule-t-il `msg.value` en supposant les mêmes décimales que l'ERC-20 ? → risque de décalage ×10¹².
- Utilise-t-il `SELFDESTRUCT` dans un pattern qui suppose la sémantique Ethereum ?
- Dépend-il de `PREVRANDAO` comme source d'aléa ?
- Utilise-t-il des transactions blob (EIP-4844) ?
- A-t-il une pool ou une logique de swap qui pourrait pairer USDC natif contre USDC ERC-20 ?
- Simule-t-il l'EVM localement avec un `anvil` standard ? → utiliser `arc-anvil --network arc` à la place (voir fichier 04), un EVM générique ne reproduit pas ces comportements.

Guide dédié à consulter si besoin : "Porting contracts to Arc checklist" (`/arc/tutorials/porting-contracts-to-arc`, non détaillé ici — à récupérer si un vrai portage est engagé).
