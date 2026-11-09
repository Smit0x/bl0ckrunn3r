// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SqueekPredictManual
/// @notice Self-contained 3-minute simulator. Anyone starts a round; the contract simulates how many
///         blocks would be produced in that 3 minutes. The 4 closest distinct predictions win fixed
///         tiers (50/25/15/10%), normalized when fewer. Claim is manual (pull).
contract SqueekPredictManual {
    enum RoundStatus { None, Betting, Finalized, Cancelled }

    struct Round {
        uint256 startHeight;
        uint256 endHeight;
        uint256 result; // blocks produced in the simulated window
        uint64 startTime;
        uint64 endTime;
        uint256 pot;
        uint256 totalUserStake;
        RoundStatus status;
    }

    struct PrizeStream {
        uint256 perRound;
        uint256 remainingRounds;
    }

    // --- access ---
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    modifier whenNotPaused() {
        require(!gamePaused, "Game paused");
        _;
    }

    // --- config ---
    uint256 public roundDuration = 180; // 3 minutes
    uint256 public minBlocksPerRound = 1;
    uint256 public maxBlocksPerRound = 100;
    uint256 public gracePeriod = 5;
    uint256 public feeBps = 1000;
    uint256 public minBet;
    uint256 public maxBet = type(uint256).max;
    uint256 public maxBetSpan = 100;
    uint256[4] public tierWeights = [5000, 2500, 1500, 1000];
    bool public gamePaused;

    // --- state ---
    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => uint256)) public numberStakes;
    mapping(uint256 => mapping(uint256 => uint256)) public numberUsers;
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public userStake;
    mapping(uint256 => uint256[]) public activeNumbers;
    mapping(uint256 => uint256[]) public winningDistances;
    mapping(uint256 => mapping(uint256 => uint256)) public distanceTotalStake;
    mapping(uint256 => mapping(uint256 => uint256)) public tierReward;

    PrizeStream[] public streams;
    uint256 public ownerFees;

    uint256 private _rs = 1;
    uint256 private _nonce;
    uint256 private _prodStart;
    uint256 private _prodEnd;
    uint256 private _roundBlocks;

    // --- events ---
    event RoundStarted(uint256 indexed roundId, uint256 startHeight, uint64 startTime, uint64 endTime);
    event BetPlaced(uint256 indexed roundId, address indexed user, uint256 number, uint256 amount);
    event RoundFinalized(
        uint256 indexed roundId, uint256 result, uint256[] distances, uint256[] rewards, uint256 pot, uint256 fee
    );
    event RoundCancelled(uint256 indexed roundId);
    event Claimed(uint256 indexed roundId, address indexed user, uint256 amount);
    event Refunded(uint256 indexed roundId, address indexed user, uint256 amount);
    event PrizeDeposited(address indexed depositor, uint256 amount, uint256 roundCount, uint256 perRound);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier nonReentrant() {
        require(_rs == 1, "Reentrant");
        _rs = 2;
        _;
        _rs = 1;
    }

    // --- helpers ---
    function currentHeight() public view returns (uint256) {
        if (_prodEnd == 0) return 0;
        uint256 t = block.timestamp > _prodEnd ? _prodEnd : block.timestamp;
        if (t <= _prodStart) return 0;
        return ((t - _prodStart) * _roundBlocks) / (_prodEnd - _prodStart);
    }

    function blockHeight() public view returns (uint256) {
        return currentHeight();
    }

    function blocksProducedSoFar() public view returns (uint256) {
        uint256 id = currentRoundId;
        if (id == 0) return 0;
        Round storage r = rounds[id];
        if (r.status != RoundStatus.Betting) return r.result;
        return currentHeight();
    }

    function productionActive() public view returns (bool) {
        return _prodEnd != 0 && block.timestamp < _prodEnd;
    }

    function _random(uint256 max) internal returns (uint256) {
        _nonce++;
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, _nonce))) % max;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function roundStatus(uint256 roundId) external view returns (RoundStatus) {
        return rounds[roundId].status;
    }

    function streamsLength() external view returns (uint256) {
        return streams.length;
    }

    function getActiveNumbers(uint256 roundId) external view returns (uint256[] memory) {
        return activeNumbers[roundId];
    }

    function getActiveNumberStates(uint256 roundId)
        external
        view
        returns (uint256[] memory numbers, uint256[] memory stakes, uint256[] memory users)
    {
        uint256[] memory active = activeNumbers[roundId];
        uint256 len = active.length;
        numbers = new uint256[](len);
        stakes = new uint256[](len);
        users = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 n = active[i];
            numbers[i] = n;
            stakes[i] = numberStakes[roundId][n];
            users[i] = numberUsers[roundId][n];
        }
    }

    function getWinningDistances(uint256 roundId) external view returns (uint256[] memory) {
        return winningDistances[roundId];
    }

    // --- lifecycle (permissionless) ---
    function startRound() external whenNotPaused {
        uint256 id = currentRoundId;
        if (id > 0) {
            require(rounds[id].status != RoundStatus.Betting, "Prev round active");
        }
        id += 1;
        currentRoundId = id;

        // Simulate a fixed 3-minute production window: blocks ramp 0 -> _roundBlocks.
        _prodStart = block.timestamp;
        _prodEnd = _prodStart + roundDuration;
        _roundBlocks = minBlocksPerRound + _random(maxBlocksPerRound - minBlocksPerRound + 1);

        Round storage r = rounds[id];
        r.startHeight = 0;
        r.startTime = uint64(_prodStart);
        r.endTime = uint64(_prodEnd);
        r.status = RoundStatus.Betting;

        uint256 seed = _consumeStreams();
        if (seed > 0) r.pot += seed;

        emit RoundStarted(id, 0, r.startTime, r.endTime);
    }

    function _consumeStreams() internal returns (uint256 seed) {
        uint256 len = streams.length;
        uint256 write;
        for (uint256 i = 0; i < len; i++) {
            uint256 perRound = streams[i].perRound;
            uint256 remaining = streams[i].remainingRounds;
            if (remaining == 0) continue;
            seed += perRound;
            remaining -= 1;
            if (remaining > 0) {
                streams[write] = PrizeStream(perRound, remaining);
                write++;
            }
        }
        for (uint256 i = write; i < len; i++) {
            streams.pop();
        }
    }

    function bet(uint256 roundId, uint256 number) external payable whenNotPaused {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Betting, "Round not active");
        require(block.timestamp < r.endTime, "Betting closed");
        require(msg.value > 0 && msg.value >= minBet && msg.value <= maxBet, "Bad amount");

        require(number <= maxBetSpan, "Number out of range");

        if (numberStakes[roundId][number] == 0) {
            activeNumbers[roundId].push(number);
        }
        if (userStake[roundId][msg.sender][number] == 0) {
            numberUsers[roundId][number] += 1;
        }
        numberStakes[roundId][number] += msg.value;
        userStake[roundId][msg.sender][number] += msg.value;
        r.pot += msg.value;
        r.totalUserStake += msg.value;

        emit BetPlaced(roundId, msg.sender, number, msg.value);
    }

    function finalize(uint256 roundId) external {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Betting, "Not active");
        require(block.timestamp >= uint256(r.endTime) + gracePeriod, "Too early");

        uint256 h = currentHeight(); // == _roundBlocks (blocks produced in the window)
        r.endHeight = h;
        r.result = h;
        uint256 pot = r.pot;

        // Empty round: whole pot (seed, if any) goes to owner.
        if (r.totalUserStake == 0) {
            ownerFees += pot;
            r.status = RoundStatus.Finalized;
            emit RoundFinalized(roundId, r.result, new uint256[](0), new uint256[](0), pot, pot);
            return;
        }

        uint256 fee = (pot * feeBps) / 10000;
        ownerFees += fee;
        uint256 rewardPool = pot - fee;

        _resolveWinners(roundId, r.result, rewardPool);

        uint256[] memory dists = winningDistances[roundId];
        uint256[] memory rewards = new uint256[](dists.length);
        for (uint256 i = 0; i < dists.length; i++) {
            rewards[i] = tierReward[roundId][dists[i]];
        }

        r.status = RoundStatus.Finalized;
        emit RoundFinalized(roundId, r.result, dists, rewards, pot, fee);
    }

    // Selects the up-to-4 smallest distinct distances and stores tier rewards in storage.
    // Split out of finalize() so it compiles without via-ir (Remix default pipeline).
    function _resolveWinners(uint256 roundId, uint256 target, uint256 rewardPool) internal {
        uint256[] memory active = activeNumbers[roundId];
        uint256 len = active.length;
        uint256 count;

        for (uint256 rank = 0; rank < 4; rank++) {
            uint256 bestD = type(uint256).max;
            uint256 bestS;
            bool found;

            for (uint256 i = 0; i < len; i++) {
                uint256 n = active[i];
                uint256 stake = numberStakes[roundId][n];
                if (stake == 0) continue;
                uint256 d = n > target ? n - target : target - n;

                // Skip distances already selected in earlier ranks.
                if (rank > 0 && d <= winningDistances[roundId][rank - 1]) continue;

                if (d < bestD) {
                    bestD = d;
                    bestS = stake;
                    found = true;
                } else if (d == bestD) {
                    bestS += stake;
                }
            }

            if (!found) break;

            winningDistances[roundId].push(bestD);
            distanceTotalStake[roundId][bestD] = bestS;
            count++;
        }

        uint256 weightSum;
        for (uint256 i = 0; i < count; i++) {
            weightSum += tierWeights[i];
        }

        for (uint256 i = 0; i < count; i++) {
            uint256 d = winningDistances[roundId][i];
            tierReward[roundId][d] = (rewardPool * tierWeights[i]) / weightSum;
        }
    }

    function claim(uint256 roundId, uint256[] calldata numbers) external nonReentrant {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Finalized, "Not finalized");
        uint256 h = r.result;
        uint256 total;
        for (uint256 i = 0; i < numbers.length; i++) {
            uint256 n = numbers[i];
            uint256 stake = userStake[roundId][msg.sender][n];
            if (stake == 0) continue;
            uint256 d = n > h ? n - h : h - n;
            uint256 reward = tierReward[roundId][d];
            if (reward == 0) continue;
            total += (reward * stake) / distanceTotalStake[roundId][d];
            userStake[roundId][msg.sender][n] = 0;
        }
        require(total > 0, "Nothing to claim");
        (bool ok,) = payable(msg.sender).call{value: total}("");
        require(ok, "ETH send failed");
        emit Claimed(roundId, msg.sender, total);
    }

    function cancelRound(uint256 roundId) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Betting, "Not active");
        r.status = RoundStatus.Cancelled;
        uint256 seed = r.pot > r.totalUserStake ? r.pot - r.totalUserStake : 0;
        if (seed > 0) ownerFees += seed;
        emit RoundCancelled(roundId);
    }

    function refund(uint256 roundId, uint256[] calldata numbers) external nonReentrant {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Cancelled, "Not cancelled");
        uint256 total;
        for (uint256 i = 0; i < numbers.length; i++) {
            uint256 n = numbers[i];
            uint256 stake = userStake[roundId][msg.sender][n];
            if (stake == 0) continue;
            total += stake;
            userStake[roundId][msg.sender][n] = 0;
        }
        require(total > 0, "Nothing to refund");
        (bool ok,) = payable(msg.sender).call{value: total}("");
        require(ok, "ETH send failed");
        emit Refunded(roundId, msg.sender, total);
    }

    function depositPrize(uint256 roundCount) external payable onlyOwner {
        require(roundCount >= 1, "Bad count");
        require(msg.value > 0, "Zero deposit");
        require(streams.length < 64, "Too many streams");
        uint256 perRound = msg.value / roundCount;
        require(perRound > 0, "Per-round too small");
        streams.push(PrizeStream(perRound, roundCount));
        uint256 remainder = msg.value - perRound * roundCount;
        if (remainder > 0) ownerFees += remainder;
        emit PrizeDeposited(msg.sender, msg.value, roundCount, perRound);
    }

    function pauseGame() external onlyOwner {
        gamePaused = true;
    }

    function unpauseGame() external onlyOwner {
        gamePaused = false;
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = ownerFees;
        ownerFees = 0;
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "ETH send failed");
        emit FeesWithdrawn(owner, amount);
    }

    function emergencyWithdraw() external onlyOwner nonReentrant {
        gamePaused = true;
        uint256 amount = address(this).balance;
        ownerFees = 0;
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "ETH send failed");
        emit EmergencyWithdraw(owner, amount);
    }

    // --- owner config ---
    function setFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 2500, "Fee too high");
        feeBps = bps;
    }

    function setGracePeriod(uint256 g) external onlyOwner {
        gracePeriod = g;
    }

    function setRoundDuration(uint256 d) external onlyOwner {
        require(d > 0, "Zero duration");
        roundDuration = d;
    }

    function setProductionParams(uint256 minBlocks_, uint256 maxBlocks_) external onlyOwner {
        require(minBlocks_ > 0 && maxBlocks_ >= minBlocks_, "Bad params");
        minBlocksPerRound = minBlocks_;
        maxBlocksPerRound = maxBlocks_;
        maxBetSpan = maxBlocks_;
    }

    function setMinMaxBet(uint256 min_, uint256 max_) external onlyOwner {
        require(max_ >= min_, "Bad range");
        minBet = min_;
        maxBet = max_;
    }

    function setMaxBetSpan(uint256 s) external onlyOwner {
        require(s > 0, "Zero span");
        maxBetSpan = s;
    }

    function setTierWeights(uint256[4] calldata w) external onlyOwner {
        uint256 sum;
        for (uint256 i = 0; i < 4; i++) {
            require(w[i] > 0, "Zero weight");
            sum += w[i];
        }
        require(sum <= 10000, "Weights too high");
        tierWeights = w;
    }

}
