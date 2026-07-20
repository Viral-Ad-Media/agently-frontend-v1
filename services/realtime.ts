// services/realtime.ts
// Drop this file in your agently frontend at: services/realtime.ts
// Then wire it into App.tsx as shown at the bottom of this file.
//
// Required env var in your FRONTEND .env:
//   VITE_SUPABASE_URL=https://xxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...  (anon/public key, NOT service key)

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Only create client if env vars are present
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type RealtimeEvent = 'call' | 'lead' | 'usage' | 'wallet';

export interface RealtimeCallbacks {
  onCall?: () => void;
  onLead?: () => void;
  onUsage?: () => void;
  onWallet?: (balanceUsd: number | null) => void;
  onAny?: () => void;
}

/**
 * Subscribe to live updates for a specific organization.
 * Fires callbacks whenever a new call, lead, or usage change happens.
 *
 * Usage in App.tsx:
 *
 *   import { subscribeToOrgRealtime } from './services/realtime';
 *
 *   useEffect(() => {
 *     if (!org?.id) return;
 *     const unsub = subscribeToOrgRealtime(org.id, {
 *       onAny: () => void refreshWorkspace(),
 *     });
 *     return unsub;
 *   }, [org?.id]);
 */
export function subscribeToOrgRealtime(
  orgId: string,
  callbacks: RealtimeCallbacks,
): () => void {
  if (!supabase) {
    console.warn('Supabase realtime not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend .env');
    return () => {};
  }

  const channels: RealtimeChannel[] = [];

  // ── New call records ─────────────────────────────────────────
  const callChannel = supabase
    .channel(`calls:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_records',
        filter: `organization_id=eq.${orgId}`,
      },
      () => {
        callbacks.onCall?.();
        callbacks.onAny?.();
      },
    )
    .subscribe();
  channels.push(callChannel);

  // ── New leads ────────────────────────────────────────────────
  const leadChannel = supabase
    .channel(`leads:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: `organization_id=eq.${orgId}`,
      },
      () => {
        callbacks.onLead?.();
        callbacks.onAny?.();
      },
    )
    .subscribe();
  channels.push(leadChannel);

  // ── Org usage updates (minutes, calls counters) ──────────────
  const usageChannel = supabase
    .channel(`usage:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'organizations',
        filter: `id=eq.${orgId}`,
      },
      () => {
        callbacks.onUsage?.();
        callbacks.onAny?.();
      },
    )
    .subscribe();
  channels.push(usageChannel);

  // ── Wallet balance updates ───────────────────────────────────
  const walletChannel = supabase
    .channel(`wallet:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'billing_wallets',
        filter: `organization_id=eq.${orgId}`,
      },
      (payload) => {
        const next = payload.new as
          | { balance_usd?: number | string | null }
          | undefined;
        const previous = payload.old as
          | { balance_usd?: number | string | null }
          | undefined;
        const rawBalance = next?.balance_usd ?? previous?.balance_usd ?? null;
        const parsedBalance = rawBalance === null ? null : Number(rawBalance);

        callbacks.onWallet?.(
          parsedBalance !== null && Number.isFinite(parsedBalance)
            ? parsedBalance
            : null,
        );
      },
    )
    .subscribe();
  channels.push(walletChannel);

  // Return cleanup function
  return () => {
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}

export { supabase };
