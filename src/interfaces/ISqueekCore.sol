// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal view of SqueekCore. `state()` mirrors the on-chain SqueekCore V3 ABI so the
/// same interface works against the real proxy (Sepolia) and our local mock.
interface ISqueekCore {
    struct CoreState {
        uint64 settledThroughRound;
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint64 blockHeight;
        uint96 blockProgress;
        uint32 workPerThousandBlocks;
        uint256 authorizationNonce;
        bool paused;
    }

    function state() external view returns (CoreState memory);
}
