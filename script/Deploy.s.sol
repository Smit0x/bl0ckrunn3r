// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {SqueekPredict} from "../src/SqueekPredict.sol";
import {MockSqueekCore} from "../src/mocks/MockSqueekCore.sol";

/// Deploys a MockSqueekCore + SqueekPredict for local testing.
/// Deployer becomes both owner and keeper; call setKeeper() afterwards to point at the cron.
contract Deploy is Script {
    function run() external returns (SqueekPredict predict, MockSqueekCore core) {
        vm.startBroadcast();
        core = new MockSqueekCore();
        predict = new SqueekPredict(address(core), msg.sender);
        vm.stopBroadcast();
    }
}
