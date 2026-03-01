import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

const GENESIS_API_URL = 'https://api.barriosa2i.com';

// Force dynamic - this route cannot be statically rendered
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/tokens
 *
 * Proxy endpoint that fetches token balance from GENESIS backend.
 * Maps Clerk user ID → Stripe customer ID → GENESIS API.
 *
 * Query params:
 *   - source: 'genesis' | 'prisma' (default: 'genesis')
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'genesis';

    // Get user and their Stripe customer ID from Prisma
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        ownedAccounts: {
          include: {
            billingCustomer: {
              select: {
                stripeCustomerId: true,
              },
            },
            labSubscription: {
              include: {
                cycles: {
                  take: 1,
                  orderBy: { periodEnd: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      // User not provisioned yet - return 0 balance
      return NextResponse.json({
        balance: 0,
        plan_type: null,
        source: 'default',
      });
    }

    const account = user.ownedAccounts?.[0];
    const stripeCustomerId = account?.billingCustomer?.stripeCustomerId;

    // If source is 'prisma' or no Stripe customer ID, use Prisma data
    if (source === 'prisma' || !stripeCustomerId) {
      const subscription = account?.labSubscription;
      const currentCycle = subscription?.cycles?.[0];

      const tokensTotal = currentCycle?.tokensAllocated || subscription?.monthlyTokens || 0;
      const tokensUsed = currentCycle?.tokensUsed || 0;

      return NextResponse.json({
        balance: tokensTotal - tokensUsed,
        tokens_used: tokensUsed,
        tokens_total: tokensTotal,
        plan_type: subscription?.tier || null,
        source: 'prisma',
      });
    }

    // Fetch from GENESIS backend using Stripe customer ID
    try {
      const genesisResponse = await fetch(
        `${GENESIS_API_URL}/api/user/tokens?user_id=${encodeURIComponent(stripeCustomerId)}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Don't cache - we want fresh data
          cache: 'no-store',
        }
      );

      if (!genesisResponse.ok) {
        const errorText = await genesisResponse.text();
        console.error('[Tokens API] GENESIS error:', genesisResponse.status, errorText);

        // Fall back to Prisma data on GENESIS error
        const subscription = account?.labSubscription;
        const currentCycle = subscription?.cycles?.[0];
        const tokensTotal = currentCycle?.tokensAllocated || subscription?.monthlyTokens || 0;
        const tokensUsed = currentCycle?.tokensUsed || 0;

        return NextResponse.json({
          balance: tokensTotal - tokensUsed,
          tokens_used: tokensUsed,
          tokens_total: tokensTotal,
          plan_type: subscription?.tier || null,
          source: 'prisma_fallback',
          genesis_error: `HTTP ${genesisResponse.status}`,
        });
      }

      const genesisData = await genesisResponse.json();

      return NextResponse.json({
        balance: genesisData.balance ?? 0,
        plan_type: genesisData.plan_type ?? null,
        email: genesisData.email,
        stripe_customer_id: stripeCustomerId,
        source: 'genesis',
      });
    } catch (fetchError) {
      console.error('[Tokens API] GENESIS fetch error:', fetchError);

      // Fall back to Prisma on network error
      const subscription = account?.labSubscription;
      const currentCycle = subscription?.cycles?.[0];
      const tokensTotal = currentCycle?.tokensAllocated || subscription?.monthlyTokens || 0;
      const tokensUsed = currentCycle?.tokensUsed || 0;

      return NextResponse.json({
        balance: tokensTotal - tokensUsed,
        tokens_used: tokensUsed,
        tokens_total: tokensTotal,
        plan_type: subscription?.tier || null,
        source: 'prisma_fallback',
        genesis_error: fetchError instanceof Error ? fetchError.message : 'Network error',
      });
    }
  } catch (error) {
    console.error('[Tokens API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token balance' },
      { status: 500 }
    );
  }
}
