# 04 : Build sur Arc : déployer et interagir avec des contrats

Sources : `docs.arc.io/build`, `/arc/tutorials/deploy-on-arc`.

> **Mise à jour du 17/09/2026** : Le tutoriel officiel ci-dessous cible toujours le **Testnet** par défaut (`ARC_TESTNET_RPC_URL`, chain ID 5042002, faucet). Depuis le lancement du Mainnet (16/09/2026), un déploiement réel se fait avec les mêmes commandes `arc-forge`/`arc-cast` mais en pointant vers `https://rpc.mainnet.arc.io` (chain ID **5042**, pas de faucet : financer le wallet avec du vrai USDC) et en vérifiant sur `https://explorer.arc.io` au lieu de `explorer.testnet.arc.io`. Voir fichier 01 pour le tableau complet des deux réseaux. La doc "Try it on Arc Studio" (bouton présent sur la page du tutoriel, `studio.arc.io`) confirme l'existence d'"Arc Studio" mentionné plus bas : plateforme low-code/no-code à explorer si besoin.
>
> **Note projet du 18/09/2026** : Ce fichier documente fidèlement le tutoriel officiel Arc, qui est bâti autour d'Arc Foundry. **Le projet Arc Flash Drop n'utilise cependant pas Arc Foundry mais Hardhat** (voir la section "Tech stack" de `CLAUDE.md` à la racine du repo) : Arc Foundry n'a pas de binaire précompilé pour Windows natif (seulement Linux/macOS, cf. Étape 1 ci-dessous), ce qui aurait nécessité de maintenir une VM Linux dédiée rien que pour le toolchain. Hardhat est basé sur Node.js et tourne nativement sur Windows. Conséquence acceptée : `arc-anvil` reproduit fidèlement les différences protocolaires d'Arc (fichier 02) en local, alors que le réseau local de Hardhat est un simulateur EVM générique qui ne les modélise pas : un compromis jugé acceptable ici car le contrat `FlashDrop` ne touche à aucune des divergences documentées (pas de `SELFDESTRUCT`, pas de dépendance à `PREVRANDAO`, pas de transfert de valeur native : uniquement un `USDC.transferFrom` via Permit2, une interaction ERC-20 ordinaire). Ce fichier reste correct comme référence sur l'outillage qu'Arc documente officiellement ; il ne décrit pas l'outillage réellement utilisé par ce projet.

## Vue d'ensemble ("Build on Arc")

Trois grandes portes d'entrée pour développer :
1. **App Kits** : SDK pour bridging/swap/transferts/solde unifié, multi-chaînes (pas propre à Arc, voir fichiers 06-09).
2. **Déploiement de smart contracts** sur le L1 Arc lui-même (ce fichier).
3. **Outils tiers** : RPC, indexation de données, conformité (voir fichier 11).

### Démarrage rapide
- **Connect to Arc** (`/arc/references/connect-to-arc`) : endpoints RPC, chain ID, config réseau testnet.
- **Deploy on Arc** (`/arc/tutorials/deploy-on-arc`) : déployer/tester/interagir avec un contrat Solidity : détaillé ci-dessous.

### Quickstarts réseau
| Quickstart | Ce qu'on construit |
|---|---|
| Deploy contracts (Circle) | Déployer des templates ERC-20/ERC-721/ERC-1155 pré-audités via Circle Contracts, sans écrire de Solidity |
| Interact with contracts | Mint, transfert, airdrop de tokens sur des contrats déployés |
| Monitor contract events | Webhooks et moniteurs d'événements onchain |

### Outils développeur (détail fichier 11)
Account abstraction, fournisseurs de nœuds, indexeurs de données, outils de conformité.

### Applications d'exemple
Galerie d'exemples/implémentations de référence sur GitHub (`/arc/references/sample-applications`) : à consulter directement le moment venu.

---

## Tutoriel : déployer avec Arc Foundry

**Arc Foundry** = fork de Foundry adapté aux différences protocolaires d'Arc (voir fichier 02). `arc-forge init` scaffold un projet Solidity fonctionnel (contrat, tests, script de déploiement) : pas besoin d'écrire de code contrat pour le premier essai. Alternative sans code : "Arc Studio" (mentionné dans la doc, à explorer).

### Prérequis
- Shell Unix (macOS, Linux, ou Windows + WSL)
- Éditeur de code (VS Code par ex.)

### Étape 1 : Installer Arc Foundry
Télécharger l'archive pour sa plateforme (binaires précompilés Linux x86_64/arm64, macOS Apple Silicon ; pour Intel Mac/Windows natif → compiler depuis les sources) :
```bash
tar -xzf arc-foundry-<version>-<target>.tar.gz
mkdir -p ~/.local/bin
mv forge ~/.local/bin/arc-forge
mv cast ~/.local/bin/arc-cast
mv anvil ~/.local/bin/arc-anvil
export PATH="$HOME/.local/bin:$PATH"   # à ajouter au profil shell (.zshrc/.bash_profile)
arc-forge --version   # vérification
```
Scaffold d'un nouveau projet :
```bash
arc-forge init hello-arc && cd hello-arc
```
Génère `src/Counter.sol`, `test/Counter.t.sol`, `script/Counter.s.sol`. Le `.gitignore` exclut déjà `.env`.

### Étape 2 : Configurer
Fichier `.env` à la racine :
```
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.io"
```
Puis `source .env`. **Ne jamais committer `.env`.**

### Étape 3 : Tester en local
```bash
arc-forge test --network arc
```
`arc-anvil --network arc` permet de lancer un nœud Arc local (fork possible de l'état testnet) pour tester des interactions avant déploiement.

### Étape 4 : Déployer sur Arc Testnet

**4.1 Créer et financer un wallet**
```bash
arc-cast wallet new
```
→ retourne adresse + clé privée (à ajouter à `.env` comme `PRIVATE_KEY`, jamais versionnée). Financer via le **Circle Faucet** (sélectionner "Arc Testnet") : l'USDC de test sert de gas, sans valeur réelle.

**4.2 Déployer**
```bash
arc-forge create src/Counter.sol:Counter \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```
→ retourne l'adresse déployée (à sauvegarder en `.env` comme `COUNTER_ADDRESS`) et le hash de transaction.

**4.3 Vérifier sur l'explorer**
L'explorer testnet tourne sous Blockscout :
```bash
arc-forge verify-contract $COUNTER_ADDRESS src/Counter.sol:Counter \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/
```
Pour un constructeur avec arguments, encoder l'ABI avec `arc-cast abi-encode` et passer `--constructor-args`. Vérification manuelle possible aussi depuis la page de vérification de l'explorer si le déploiement n'a pas été fait via Foundry.

### Étape 5 : Interagir
```bash
# Lire l'état
arc-cast call $COUNTER_ADDRESS "number()(uint256)" --rpc-url $ARC_TESTNET_RPC_URL
# Écrire (transaction)
arc-cast send $COUNTER_ADDRESS "increment()" \
  --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY
```

### Pour aller plus loin
- Déployer des tokens/NFT prêts pour la prod sans écrire de Solidity → "Deploy contracts" (Circle Contracts, templates audités).
- Porter un contrat Solidity existant → consulter le checklist "Porting contracts to Arc" (référencé fichier 02) avant de migrer quoi que ce soit d'important, à cause des différences de règles de valeur/SELFDESTRUCT/décimales.
