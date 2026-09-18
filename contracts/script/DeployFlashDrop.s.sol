// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {FlashDrop} from "../src/FlashDrop.sol";

/// @notice Deploys one FlashDrop instance. Run against Arc mainnet with:
///   arc-forge script script/DeployFlashDrop.s.sol:DeployFlashDrop \
///     --rpc-url $ARC_MAINNET_RPC_URL --private-key $PRIVATE_KEY --broadcast
/// Sale parameters come from the environment so the same script deploys any single-product drop
/// without editing source — one contract instance = one product (see PROJECT_BRIEF.md); selling a
/// second item means running this again, not adding catalog logic here.
contract DeployFlashDrop is Script {
    function run() external returns (FlashDrop) {
        uint256 startPrice = vm.envUint("START_PRICE"); // USDC, 6 decimals
        uint256 endPrice = vm.envUint("END_PRICE"); // USDC, 6 decimals
        uint256 duration = vm.envUint("DURATION_SECONDS");

        vm.startBroadcast();
        FlashDrop drop = new FlashDrop(startPrice, endPrice, duration);
        vm.stopBroadcast();

        return drop;
    }
}
