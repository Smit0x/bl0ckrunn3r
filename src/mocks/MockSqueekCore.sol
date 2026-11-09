// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISqueekCore} from "../interfaces/ISqueekCore.sol";

/// Local stand-in for SqueekCore so we can test without the Squeekchain API / live contracts.
contract MockSqueekCore is ISqueekCore {
    uint64 public settledThroughRound;
    uint64 public cumulativeWork;
    uint96 public cumulativeBlockUnits;
    uint64 public blockHeight;
    uint96 public blockProgress;
    uint32 public workPerThousandBlocks;
    uint256 public authorizationNonce;
    bool public paused;

    function state() external view override returns (ISqueekCore.CoreState memory) {
        return ISqueekCore.CoreState({
            settledThroughRound: settledThroughRound,
            cumulativeWork: cumulativeWork,
            cumulativeBlockUnits: cumulativeBlockUnits,
            blockHeight: blockHeight,
            blockProgress: blockProgress,
            workPerThousandBlocks: workPerThousandBlocks,
            authorizationNonce: authorizationNonce,
            paused: paused
        });
    }

    function setBlockHeight(uint64 h) external {
        blockHeight = h;
        cumulativeBlockUnits = uint96(uint256(h) * 1e9);
    }

    function advanceBlocks(uint64 n) external {
        blockHeight += n;
        cumulativeBlockUnits = uint96(uint256(blockHeight) * 1e9);
    }

    function setPaused(bool p) external {
        paused = p;
    }
}
