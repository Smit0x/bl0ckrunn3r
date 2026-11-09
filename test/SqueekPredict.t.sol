// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SqueekPredict} from "../src/SqueekPredict.sol";
import {MockSqueekCore} from "../src/mocks/MockSqueekCore.sol";

contract SqueekPredictTest is Test {
    SqueekPredict public predict;
    MockSqueekCore public core;

    address public keeper;
    address public alice;
    address public bob;
    address public carol;
    address public dave;
    address public eve;

    receive() external payable {}

    function setUp() public {
        keeper = makeAddr("keeper");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        dave = makeAddr("dave");
        eve = makeAddr("eve");

        core = new MockSqueekCore();
        predict = new SqueekPredict(address(core), keeper);

        vm.deal(address(this), 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(eve, 100 ether);
    }

    function _startRound() internal {
        predict.startRound();
    }

    function _bet(address user, uint256 roundId, uint256 number, uint256 amount) internal {
        vm.prank(user);
        predict.bet{value: amount}(roundId, number);
    }

    function _arr(uint256 a) internal pure returns (uint256[] memory) {
        uint256[] memory r = new uint256[](1);
        r[0] = a;
        return r;
    }

    function _warpToFinalizable(uint256 roundId) internal {
        SqueekPredict.Round memory r = predict.getRound(roundId);
        vm.warp(uint256(r.endTime) + predict.gracePeriod() + 1);
    }

    function _finalize(uint256 roundId, uint256 finalHeight) internal {
        core.setBlockHeight(uint64(finalHeight));
        _warpToFinalizable(roundId);
        predict.finalize(roundId);
    }

    function test_StartRound_RecordsState() public {
        core.setBlockHeight(1000);
        _startRound();

        SqueekPredict.Round memory r = predict.getRound(1);
        assertEq(r.startHeight, 1000);
        assertEq(uint256(r.startTime), block.timestamp);
        assertEq(uint256(r.endTime), block.timestamp + 180);
        assertTrue(r.status == SqueekPredict.RoundStatus.Betting);
    }

    function test_BlocksProducedSoFar() public {
        core.setBlockHeight(1000);
        _startRound();
        assertEq(predict.blocksProducedSoFar(), 0);

        core.advanceBlocks(5);
        assertEq(predict.blocksProducedSoFar(), 5);
    }

    function test_Bet_RecordsStakeAndUsers() public {
        core.setBlockHeight(1000);
        _startRound();

        _bet(alice, 1, 50, 1 ether);

        assertEq(predict.numberStakes(1, 50), 1 ether);
        assertEq(predict.numberUsers(1, 50), 1);
        assertEq(predict.userStake(1, alice, 50), 1 ether);

        SqueekPredict.Round memory r = predict.getRound(1);
        assertEq(r.pot, 1 ether);
        assertEq(r.totalUserStake, 1 ether);

        uint256[] memory active = predict.getActiveNumbers(1);
        assertEq(active.length, 1);
        assertEq(active[0], 50);
    }

    function test_Bet_DistinctUsersPerNumber() public {
        core.setBlockHeight(1000);
        _startRound();

        _bet(alice, 1, 50, 1 ether);
        _bet(bob, 1, 50, 1 ether);
        _bet(alice, 1, 51, 1 ether);

        assertEq(predict.numberUsers(1, 50), 2);
        assertEq(predict.numberUsers(1, 51), 1);
        assertEq(predict.numberStakes(1, 50), 2 ether);

        (uint256[] memory numbers, uint256[] memory stakes, uint256[] memory users) =
            predict.getActiveNumberStates(1);
        assertEq(numbers.length, 2);
        assertEq(users[0], 2);
        assertEq(stakes[0], 2 ether);
    }

    function test_Bet_Reverts_OutOfRange() public {
        core.setBlockHeight(0);
        _startRound();

        vm.prank(alice);
        vm.expectRevert("Number out of range");
        predict.bet{value: 1 ether}(1, 257);
    }

    function test_Bet_Reverts_NotActive() public {
        vm.prank(alice);
        vm.expectRevert("Round not active");
        predict.bet{value: 1 ether}(1, 50);
    }

    function test_Bet_Reverts_GamePaused() public {
        core.setBlockHeight(0);
        _startRound();
        predict.pauseGame();

        vm.prank(alice);
        vm.expectRevert("Game paused");
        predict.bet{value: 1 ether}(1, 50);
    }

    function test_Finalize_ComputesResultAndFourTiers() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 10, 1 ether);
        _bet(bob, 1, 11, 1 ether);
        _bet(carol, 1, 12, 1 ether);
        _bet(dave, 1, 13, 1 ether);

        _finalize(1, 1010); // 10 blocks produced

        SqueekPredict.Round memory r = predict.getRound(1);
        assertEq(r.result, 10);
        assertEq(r.endHeight, 1010);

        assertEq(predict.tierReward(1, 0), 1.8 ether);
        assertEq(predict.tierReward(1, 1), 0.9 ether);
        assertEq(predict.tierReward(1, 2), 0.54 ether);
        assertEq(predict.tierReward(1, 3), 0.36 ether);
        assertEq(predict.ownerFees(), 0.4 ether);

        vm.prank(alice);
        predict.claim(1, _arr(10));
        assertEq(alice.balance, 100.8 ether);
    }

    function test_Finalize_NormalizeFewerTiers() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 9, 1 ether);
        _bet(bob, 1, 12, 1 ether);

        _finalize(1, 1010); // 10 blocks produced -> distances 1 and 2

        assertEq(predict.tierReward(1, 1), 1.2 ether);
        assertEq(predict.tierReward(1, 2), 0.6 ether);
    }

    function test_Finalize_SymmetricTie() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 9, 1 ether);
        _bet(bob, 1, 11, 1 ether);

        _finalize(1, 1010); // 10 blocks produced

        uint256[] memory dists = predict.getWinningDistances(1);
        assertEq(dists.length, 1);
        assertEq(dists[0], 1);
        assertEq(predict.tierReward(1, 1), 1.8 ether);
        assertEq(predict.distanceTotalStake(1, 1), 2 ether);

        vm.prank(alice);
        predict.claim(1, _arr(9));
        vm.prank(bob);
        predict.claim(1, _arr(11));
        assertEq(alice.balance, 99.9 ether);
        assertEq(bob.balance, 99.9 ether);
    }

    function test_Finalize_FifthPlace_Loser() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 10, 1 ether);
        _bet(bob, 1, 11, 1 ether);
        _bet(carol, 1, 12, 1 ether);
        _bet(dave, 1, 13, 1 ether);
        _bet(eve, 1, 14, 1 ether);

        _finalize(1, 1010); // 10 blocks produced

        assertEq(predict.tierReward(1, 4), 0);
        vm.prank(eve);
        vm.expectRevert("Nothing to claim");
        predict.claim(1, _arr(14));
    }

    function test_Finalize_TooEarly() public {
        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, 50, 1 ether);

        vm.expectRevert("Too early");
        predict.finalize(1);
    }

    function test_Finalize_SettleWindowClosed() public {
        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, 50, 1 ether);

        SqueekPredict.Round memory r = predict.getRound(1);
        vm.warp(uint256(r.endTime) + predict.gracePeriod() + predict.settleWindow() + 1);

        vm.expectRevert("Settle window closed");
        predict.finalize(1);
    }

    function test_LivestreamEnd_ClosesBetting() public {
        core.setBlockHeight(0);
        _startRound();
        predict.markLivestreamEnded();

        vm.prank(alice);
        vm.expectRevert("Livestream ended");
        predict.bet{value: 1 ether}(1, 50);
    }

    function test_LivestreamEnd_EarlyFinalize() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 10, 1 ether);

        core.advanceBlocks(5); // production stops after 5 blocks
        predict.markLivestreamEnded();

        predict.finalize(1); // before the 3-minute timer ends

        SqueekPredict.Round memory r = predict.getRound(1);
        assertEq(r.result, 5);
        assertEq(r.endHeight, 1005);
        assertEq(predict.tierReward(1, 5), 0.9 ether);

        vm.prank(alice);
        predict.claim(1, _arr(10));
        assertEq(alice.balance, 99.9 ether);
    }

    function test_MarkLivestreamEnded_OnlyAuthorized() public {
        vm.prank(alice);
        vm.expectRevert("Not authorized");
        predict.markLivestreamEnded();
    }

    function test_Finalize_EmptyRound_PotToOwner() public {
        core.setBlockHeight(0);
        predict.depositPrize{value: 1 ether}(1);
        _startRound();

        _finalize(1, 10);

        assertEq(predict.ownerFees(), 1 ether);
    }

    function test_Claim_DoubleClaim_Reverts() public {
        core.setBlockHeight(1000);
        _startRound();
        _bet(alice, 1, 10, 1 ether);
        _finalize(1, 1010);

        vm.startPrank(alice);
        predict.claim(1, _arr(10));
        vm.expectRevert("Nothing to claim");
        predict.claim(1, _arr(10));
        vm.stopPrank();
    }

    function test_Cancel_ExpiredPermissionlessAndRefund() public {
        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, 50, 1 ether);

        SqueekPredict.Round memory r = predict.getRound(1);
        vm.warp(uint256(r.endTime) + predict.gracePeriod() + predict.settleWindow() + 1);

        // Anyone (not owner/keeper) may cancel an expired round.
        vm.prank(eve);
        predict.cancelRound(1);

        vm.prank(alice);
        predict.refund(1, _arr(50));
        assertEq(alice.balance, 100 ether);
    }

    function test_Cancel_BeforeExpiry_RequiresAuth() public {
        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, 50, 1 ether);

        _warpToFinalizable(1); // within settle window, not expired

        vm.prank(eve);
        vm.expectRevert("Not authorized");
        predict.cancelRound(1);
    }

    function test_DepositPrize_SplitAcrossRounds() public {
        core.setBlockHeight(0);
        predict.depositPrize{value: 3 ether}(3);

        for (uint256 i = 1; i <= 3; i++) {
            _startRound();
            SqueekPredict.Round memory r = predict.getRound(i);
            assertEq(r.pot, 1 ether);
            _finalize(i, 10);
        }

        _startRound();
        SqueekPredict.Round memory r4 = predict.getRound(4);
        assertEq(r4.pot, 0);
        assertEq(predict.streamsLength(), 0);
    }

    function test_EmergencyWithdraw() public {
        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, 50, 1 ether);

        uint256 before = address(this).balance;
        predict.emergencyWithdraw();

        assertEq(address(predict).balance, 0);
        assertEq(address(this).balance, before + 1 ether);
        assertTrue(predict.gamePaused());
    }

    function test_OnlyOwner_Setter() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        predict.setFeeBps(500);
    }

    function testFuzz_PayoutConservation(uint256 h, uint256 n1, uint256 n2, uint256 n3) public {
        h = bound(h, 0, 256);
        n1 = bound(n1, 0, 256);
        n2 = bound(n2, 0, 256);
        n3 = bound(n3, 0, 256);

        core.setBlockHeight(0);
        _startRound();
        _bet(alice, 1, n1, 1 ether);
        _bet(bob, 1, n2, 1 ether);
        _bet(carol, 1, n3, 1 ether);

        _finalize(1, h); // blocks produced == h (startHeight 0)

        uint256 pot = 3 ether;
        uint256 fee = (pot * predict.feeBps()) / 10000;
        assertEq(predict.ownerFees(), fee);
        uint256 rewardPool = pot - fee;

        uint256[] memory dists = predict.getWinningDistances(1);
        assertLe(dists.length, 4);
        uint256 sum;
        for (uint256 i = 0; i < dists.length; i++) {
            uint256 d = dists[i];
            assertGt(predict.tierReward(1, d), 0);
            sum += predict.tierReward(1, d);
            if (i > 0) assertLt(dists[i - 1], dists[i]);
        }
        assertLe(sum, rewardPool);
        assertGt(sum, rewardPool - 5);
    }
}
