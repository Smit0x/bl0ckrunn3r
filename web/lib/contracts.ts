import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

export const PREDICT_ADDRESS = (process.env.NEXT_PUBLIC_PREDICT_ADDRESS ?? '') as `0x${string}`;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';

export const isConfigured = PREDICT_ADDRESS.length === 42 && PREDICT_ADDRESS.startsWith('0x');

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// Shared ABI for both SqueekPredict (real SqueekCore) and SqueekPredictManual (simulated).
export const predictAbi = parseAbi([
  'function currentRoundId() view returns (uint256)',
  'function gamePaused() view returns (bool)',
  'function owner() view returns (address)',
  'function maxBetSpan() view returns (uint256)',
  'function roundDuration() view returns (uint256)',
  'function gracePeriod() view returns (uint256)',
  'function blocksProducedSoFar() view returns (uint256)',
  'function productionActive() view returns (bool)',
  'function getRound(uint256) view returns ((uint256,uint256,uint256,uint64,uint64,uint256,uint256,uint8))',
  'function numberStakes(uint256,uint256) view returns (uint256)',
  'function numberUsers(uint256,uint256) view returns (uint256)',
  'function userStake(uint256,address,uint256) view returns (uint256)',
  'function getActiveNumbers(uint256) view returns (uint256[])',
  'function getActiveNumberStates(uint256) view returns (uint256[],uint256[],uint256[])',
  'function getWinningDistances(uint256) view returns (uint256[])',
  'function tierReward(uint256,uint256) view returns (uint256)',
  'function bet(uint256 roundId, uint256 number) payable',
  'function claim(uint256 roundId, uint256[] numbers)',
  'function refund(uint256 roundId, uint256[] numbers)',
  'function startRound()',
  'function finalize(uint256 roundId)',
  'function cancelRound(uint256 roundId)',
]);

export interface Round {
  startHeight: bigint;
  endHeight: bigint;
  result: bigint; // blocks produced in the window (the target number)
  startTime: bigint;
  endTime: bigint;
  pot: bigint;
  totalUserStake: bigint;
  status: number; // 0 None, 1 Betting, 2 Finalized, 3 Cancelled
}

