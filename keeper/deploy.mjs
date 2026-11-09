// Local deploy helper: MockSqueekCore + SqueekPredict, then configures a short round for testing.
// Uses Foundry build artifacts in ../out. Run anvil first, then: node deploy.mjs
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const OWNER_KEY = process.env.OWNER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const KEEPER_ADDRESS = process.env.KEEPER_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEEPER_KEY = process.env.KEEPER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const coreArtifact = JSON.parse(readFileSync(resolve(__dirname, '../out/MockSqueekCore.sol/MockSqueekCore.json'), 'utf8'));
const predictArtifact = JSON.parse(readFileSync(resolve(__dirname, '../out/SqueekPredict.sol/SqueekPredict.json'), 'utf8'));

const account = privateKeyToAccount(OWNER_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

async function writeAndWait(tx) {
  const hash = await tx;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') throw new Error('tx reverted');
  return receipt;
}

async function main() {
  const coreReceipt = await writeAndWait(
    walletClient.deployContract({ abi: coreArtifact.abi, bytecode: coreArtifact.bytecode.object, args: [] }),
  );
  const coreAddress = coreReceipt.contractAddress;

  const predictReceipt = await writeAndWait(
    walletClient.deployContract({
      abi: predictArtifact.abi,
      bytecode: predictArtifact.bytecode.object,
      args: [coreAddress, KEEPER_ADDRESS],
    }),
  );
  const predictAddress = predictReceipt.contractAddress;

  // Short round so the keeper can be exercised quickly in a local demo.
  await writeAndWait(walletClient.writeContract({ address: predictAddress, abi: predictArtifact.abi, functionName: 'setRoundDuration', args: [10n] }));
  await writeAndWait(walletClient.writeContract({ address: predictAddress, abi: predictArtifact.abi, functionName: 'setGracePeriod', args: [1n] }));

  writeFileSync(
    resolve(__dirname, '.env'),
    [
      `RPC_URL=${RPC_URL}`,
      `PRIVATE_KEY=${KEEPER_KEY}`,
      `PREDICT_ADDRESS=${predictAddress}`,
      `CORE_ADDRESS=${coreAddress}`,
      'POLL_MS=2000',
      'STALL_SECONDS=600',
      '',
    ].join('\n'),
  );

  console.log('MockSqueekCore:', coreAddress);
  console.log('SqueekPredict:', predictAddress);
  console.log('keeper:', KEEPER_ADDRESS);
  console.log('roundDuration=10s, gracePeriod=1s. Wrote keeper/.env');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
