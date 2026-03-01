'use client';

import { useState, useEffect, useCallback } from 'react';

const GENESIS_API_URL = 'https://api.barriosa2i.com';
const REFRESH_INTERVAL = 30000; // 30 seconds

interface TokenBalanceState {
  balance: number;
  planType: string | null;
  loading: boolean;
  error: string | null;
}

interface UseTokenBalanceReturn extends TokenBalanceState {
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch token balance from GENESIS backend.
 *
 * IMPORTANT: GENESIS stores tokens by Stripe customer ID, not Clerk ID.
 * This hook calls the Next.js proxy API which handles the ID mapping.
 *
 * @param userId - Clerk user ID (will be mapped to Stripe customer ID server-side)
 */
export function useTokenBalance(userId: string | null | undefined): UseTokenBalanceReturn {
  const [state, setState] = useState<TokenBalanceState>({
    balance: 0,
    planType: null,
    loading: true,
    error: null,
  });

  const fetchBalance = useCallback(async () => {
    if (!userId) {
      setState({
        balance: 0,
        planType: null,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      // Call our proxy API which handles Clerk → Stripe ID mapping
      const response = await fetch(`/api/user/tokens?source=genesis`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      setState({
        balance: data.balance ?? 0,
        planType: data.plan_type ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('[useTokenBalance] Error fetching balance:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch balance',
      }));
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(fetchBalance, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [userId, fetchBalance]);

  return {
    ...state,
    refetch: fetchBalance,
  };
}

/**
 * Alternative hook that fetches directly from GENESIS (requires Stripe customer ID)
 * Use this if you already have the Stripe customer ID available.
 */
export function useTokenBalanceDirect(stripeCustomerId: string | null | undefined): UseTokenBalanceReturn {
  const [state, setState] = useState<TokenBalanceState>({
    balance: 0,
    planType: null,
    loading: true,
    error: null,
  });

  const fetchBalance = useCallback(async () => {
    if (!stripeCustomerId) {
      setState({
        balance: 0,
        planType: null,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      // Call GENESIS directly with Stripe customer ID
      const response = await fetch(
        `${GENESIS_API_URL}/api/user/tokens?user_id=${encodeURIComponent(stripeCustomerId)}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();

      setState({
        balance: data.balance ?? 0,
        planType: data.plan_type ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('[useTokenBalanceDirect] Error:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch balance',
      }));
    }
  }, [stripeCustomerId]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!stripeCustomerId) return;
    const interval = setInterval(fetchBalance, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [stripeCustomerId, fetchBalance]);

  return {
    ...state,
    refetch: fetchBalance,
  };
}
