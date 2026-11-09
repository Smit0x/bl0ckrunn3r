// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SqueekPredictManual} from "../src/SqueekPredictManual.sol";

contract SqueekPredictManualTest is Test {
    SqueekPredictManual public predict;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        predict = new SqueekPredictManual(); // owner = this test contract
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _arr(uint256 a) internal pure returns (uint256[] memory) {
        uint256[] memory r = new uint256[](1);
        r[0] = a;
        return r;
    }

    function test_AnyoneCan_StartRound() public {
        vm.prank(alice);
        predict.startRound();
        assertEq(predict.currentRoundId(), 1);
        assertEq(uint256(predict.getRound(1).status), 1); // Betting
    }

    function test_AnyoneCan_Finalize() public {
        predict.startRound();
        SqueekPredictManual.Round memory r = predict.getRound(1);
        vm.warp(uint256(r.endTime) + predict.gracePeriod() + 1);

        vm.prank(alice);
        predict.finalize(1);
        assertEq(uint256(predict.getRound(1).status), 2); // Finalized
    }

    function test_OwnerOnly_Cancel() public {
        predict.startRound();

        vm.prank(alice);
        vm.expectRevert("Not owner");
        predict.cancelRound(1);

        predict.cancelRound(1);
        assertEq(uint256(predict.getRound(1).status), 3); // Cancelled
    }

    function test_StartRound_ThreeMinuteWindow() public {
        predict.startRound();

        SqueekPredictManual.Round memory r = predict.getRound(1);
        assertEq(r.startHeight, 0);
        assertEq(uint256(r.endTime), uint256(r.startTime) + 180);
        assertTrue(predict.productionActive());
    }

    function test_CurrentHeight_RampsAndFreezes() public {
        predict.startRound();
        SqueekPredictManual.Round memory r = predict.getRound(1);
        uint256 dur = uint256(r.endTime) - uint256(r.startTime);

        vm.warp(uint256(r.startTime) + dur / 2);
        uint256 mid = predict.currentHeight();
        assertGt(mid, 0);
        assertLe(mid, predict.maxBlocksPerRound());

        vm.warp(uint256(r.endTime) + 1);
        uint256 frozen = predict.currentHeight();
        assertGt(frozen, mid);
        assertLe(frozen, predict.maxBlocksPerRound());
        assertFalse(predict.productionActive());

        // Stays frozen well after the window closes.
        vm.warp(uint256(r.endTime) + 100);
        assertEq(predict.currentHeight(), frozen);
    }

    function test_Bet_RecordsStakeAndUsers() public {
        predict.startRound();

        vm.prank(alice);
        predict.bet{value: 1 ether}(1, 50);
        vm.prank(bob);
        predict.bet{value: 1 ether}(1, 50);

        assertEq(predict.numberStakes(1, 50), 2 ether);
        assertEq(predict.numberUsers(1, 50), 2);
    }

    function test_Bet_Reverts_OutOfRange() public {
        predict.startRound();

        vm.prank(alice);
        vm.expectRevert("Number out of range");
        predict.bet{value: 1 ether}(1, 101);
    }

    function test_BettingClosesAfterProduction() public {
        predict.startRound();
        SqueekPredictManual.Round memory r = predict.getRound(1);
        vm.warp(uint256(r.endTime) + 1);

        vm.prank(alice);
        vm.expectRevert("Betting closed");
        predict.bet{value: 1 ether}(1, 50);
    }

    function test_EndToEnd_SingleWinner() public {
        predict.startRound();
        SqueekPredictManual.Round memory r = predict.getRound(1);

        vm.prank(alice);
        predict.bet{value: 1 ether}(1, 50);

        vm.warp(uint256(r.endTime) + predict.gracePeriod() + 1);
        predict.finalize(1);

        uint256 finalResult = predict.getRound(1).result;
        assertEq(finalResult, predict.currentHeight());
        assertLe(finalResult, predict.maxBlocksPerRound());

        uint256 d = finalResult > 50 ? finalResult - 50 : 50 - finalResult;
        assertEq(predict.tierReward(1, d), 0.9 ether);

        vm.prank(alice);
        predict.claim(1, _arr(50));
        assertEq(alice.balance, 9.9 ether);
    }
}
