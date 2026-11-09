// Public read-only Squeekchain API (https://docs.squeekchain.com/developers/api).
// Free, no API key, and CORS-enabled (`Access-Control-Allow-Origin: *`), so the
// browser can call it directly without a server proxy.

export const SQUEK_API_BASE = 'https://api.squeekchain.com/v1';

export interface SqueekStatus {
  // The device/pipeline is reporting fresh data (vs "stale"/"unavailable").
  freshness: string | null;
  // Device state: "IDLE" | "ACTIVE" | "COUNTER_FAULT".
  coreStatus: string | null;
  // Wheel speed in thousandths of a revolution per minute (0 when stopped).
  rpmMilli: number | null;
  // Settled frontier block height (12 confirmations behind the chain tip).
  blockHeight: bigint | null;
  // Optimistic block height, includes queued (not yet settled) work.
  projectedBlockHeight: bigint | null;
  // Projected blocks completed in the current round.
  completedBlocks: bigint | null;
  oracleState: string | null;
  builderStatus: string | null;
  observedAt: string | null;
}

function toBig(value: unknown): bigint | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function fetchSqueekStatus(signal?: AbortSignal): Promise<SqueekStatus | null> {
  try {
    const res = await fetch(`${SQUEK_API_BASE}/status`, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    const d = await res.json();

    const measurement = d?.measurement ?? {};
    const anchor = d?.builder?.anchor ?? {};
    const projected = d?.builder?.projected ?? {};

    return {
      freshness: measurement.freshness ?? null,
      coreStatus: measurement.coreStatus ?? null,
      rpmMilli: typeof measurement.rpmMilli === 'number' ? measurement.rpmMilli : null,
      blockHeight: toBig(anchor.blockHeight),
      projectedBlockHeight: toBig(projected.blockHeight),
      completedBlocks: toBig(projected.completedBlockCount),
      oracleState: d?.oracle?.state ?? null,
      builderStatus: d?.builder?.status ?? null,
      observedAt: measurement.observedAt ?? null,
    };
  } catch {
    return null;
  }
}
