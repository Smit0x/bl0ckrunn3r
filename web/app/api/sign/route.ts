import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';
import { toHex } from 'viem';

export const runtime = 'nodejs';

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const appSecret = process.env.PRIVY_APP_SECRET ?? '';
const authKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? '';
const predictAddress = (process.env.NEXT_PUBLIC_PREDICT_ADDRESS ?? '').toLowerCase();

let client: PrivyClient | null = null;
function getClient() {
  if (!client) client = new PrivyClient({ appId, appSecret });
  return client;
}

export async function POST(req: Request) {
  if (!appSecret || !authKey) {
    return NextResponse.json({ error: 'Server signing not configured' }, { status: 500 });
  }

  let body: { walletId?: string; to?: string; data?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { walletId, to, data, value } = body;
  if (!walletId || !to || !data) {
    return NextResponse.json({ error: 'Missing walletId, to, or data' }, { status: 400 });
  }
  if (to.toLowerCase() !== predictAddress) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  }

  let valueWei: bigint;
  try {
    valueWei = BigInt(value ?? '0');
  } catch {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }

  try {
    const res = await getClient()
      .wallets()
      .ethereum()
      .sendTransaction(walletId, {
        caip2: 'eip155:11155111',
        params: {
          transaction: {
            to,
            data,
            value: toHex(valueWei),
            chain_id: 11155111,
          },
        },
        authorization_context: { authorization_private_keys: [authKey] },
      });
    return NextResponse.json({ hash: res.hash });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
