// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {SqueekPredictManual} from "../src/SqueekPredictManual.sol";

/// Deploys the self-contained SqueekPredictManual (simulator) contract.
/// The deployer becomes `owner` (the only privileged role: pause, cancel, fees, config).
/// `startRound` / `finalize` are permissionless on-chain.
///
/// Run against Sepolia with:
///   forge script script/DeployManual.s.sol:DeployManual \
///     --rpc-url $RPC_URL --private-key $OWNER_KEY --broadcast
contract DeployManual is Script {
    function run() external returns (SqueekPredictManual predict) {
        vm.startBroadcast();
        predict = new SqueekPredictManual();
        vm.stopBroadcast();
    }
}
