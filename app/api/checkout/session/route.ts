// =============================================================================
// POST /api/checkout/session - Create Stripe Checkout Session
// Supports: SUBSCRIPTION, CONSULTATION, TOP_UP, UPGRADE, ENTERPRISE intents
// Next.js App Router API Route
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

// Lazy initialization for serverless
let stripe: Stripe | null = null;
let prisma: PrismaClient | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
  }
  return stripe;
}

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// Product Catalog - V2 "Performance Engine" Pricing
// Updated 2026-01-29 with actual Stripe price IDs
const PRODUCT_CATALOG = [
  // V2 COMMERCIAL LAB SUBSCRIPTIONS (monthly only)
  {
    id: 'prod_TsifPU8AtmGacQ',
    category: 'COMMERCIAL_LAB',
    metadata: { tier: 'PROTOTYPER', tokens: '16' },
    prices: [
      { id: 'price_1SuxDoLyFGkLiU4CxxLjgoZq', recurring: { interval: 'month' } },
    ],
  },
  {
    id: 'prod_TsihSVy6TuDqQS',
    category: 'COMMERCIAL_LAB',
    metadata: { tier: 'GROWTH', tokens: '40' },
    prices: [
      { id: 'price_1SuxFnLyFGkLiU4CzqWvv9DR', recurring: { interval: 'month' } },
    ],
  },
  {
    id: 'prod_TsihDQL1l9FesH',
    category: 'COMMERCIAL_LAB',
    metadata: { tier: 'SCALE', tokens: '96' },
    prices: [
      { id: 'price_1SuxGQLyFGkLiU4CiDiAEkOD', recurring: { interval: 'month' } },
    ],
  },
  // V2 ENTRY OFFER: RAPID PILOT (one-time)
  {
    id: 'prod_TsijBRlNjstjQQ',
    category: 'ENTRY_OFFER',
    metadata: { type: 'rapid_pilot', tokens: '8' },
    prices: [{ id: 'price_1SuxIMLyFGkLiU4CBoIEIfs8' }],
  },
  // V2 TOKEN PACKS (one-time, non-subscriber pricing at $75/token)
  {
    id: 'prod_TsimCkEe8xqNXm',
    category: 'TOKEN_PACK',
    metadata: { tokens: '8', commercials: '1' },
    prices: [{ id: 'price_1SuxKTLyFGkLiU4CyMuPCSPL' }],
  },
  {
    id: 'prod_Tsin5CzxDOqIrB',
    category: 'TOKEN_PACK',
    metadata: { tokens: '16', commercials: '2' },
    prices: [{ id: 'price_1SuxMCLyFGkLiU4C8Q45qVPJ' }],
  },
  {
    id: 'prod_TsipCaJHJqtCOM',
    category: 'TOKEN_PACK',
    metadata: { tokens: '40', commercials: '5' },
    prices: [{ id: 'price_1SuxO2LyFGkLiU4CRR7D14wh' }],
  },
  // CONSULTATION (unchanged)
  {
    id: 'prod_consultation_strategy',
    category: 'CONSULTATION',
    metadata: { consultationType: 'STRATEGY_45', creditableTiers: 'SCALE,GROWTH' },
    prices: [{ id: 'price_consultation_strategy' }],
  },
  {
    id: 'prod_consultation_architecture',
    category: 'CONSULTATION',
    metadata: { consultationType: 'ARCHITECTURE_90', creditableTiers: 'SCALE' },
    prices: [{ id: 'price_consultation_architecture' }],
  },
];

// Calendly URL mapping
const CALENDLY_URLS: Record<string, string> = {
  STRATEGY_45: process.env.CALENDLY_STRATEGY_URL || 'https://calendly.com/barrios-a2i/strategy-45',
  ARCHITECTURE_90: process.env.CALENDLY_ARCHITECTURE_URL || 'https://calendly.com/barrios-a2i/architecture-90',
  ENTERPRISE: process.env.CALENDLY_ENTERPRISE_URL || 'https://calendly.com/barrios-a2i/enterprise-discovery',
};

interface CartItem {
  priceId: string;
  quantity: number;
}

interface ProductPrice {
  id: string;
  recurring?: { interval: string };
}

interface Product {
  id: string;
  category: string;
  metadata: Record<string, string | undefined>;
  prices: ProductPrice[];
}

function getProductByPriceId(priceId: string): Product | undefined {
  return PRODUCT_CATALOG.find((product) =>
    product.prices.some((price) => price.id === priceId)
  ) as Product | undefined;
}

/**
 * Determine checkout mode based on intent and cart items
 */
function determineCheckoutMode(items: CartItem[], intent: string): 'payment' | 'subscription' {
  if (intent === 'CONSULTATION' || intent === 'TOP_UP') {
    return 'payment';
  }

  for (const item of items) {
    const product = getProductByPriceId(item.priceId);
    if (product) {
      const price = product.prices.find((pr) => pr.id === item.priceId);
      if (price?.recurring) {
        return 'subscription';
      }
    }
  }
  return 'payment';
}

/**
 * Get consultation details from cart
 */
function getConsultationDetails(items: CartItem[]) {
  for (const item of items) {
    const product = getProductByPriceId(item.priceId);
    if (product && product.category === 'CONSULTATION') {
      const consultationType = product.metadata?.consultationType || 'STRATEGY_45';
      const creditableTiers = product.metadata?.creditableTiers?.split(',') || [];
      return {
        consultationType,
        calendlyUrl: CALENDLY_URLS[consultationType] || CALENDLY_URLS['STRATEGY_45'],
        creditableTiers,
      };
    }
  }
  return null;
}

/**
 * Get token count for a given price ID (for token packs)
 */
function getTokensForPriceId(priceId: string | undefined): number {
  if (!priceId) return 0;

  const product = getProductByPriceId(priceId);
  if (product?.category === 'TOKEN_PACK') {
    const tokens = product.metadata?.tokens;
    if (tokens) return parseInt(tokens, 10);
  }

  // Fallback mapping - V2 pricing
  const tokenMap: Record<string, number> = {
    // V2 Token Packs
    'price_1SuxKTLyFGkLiU4CyMuPCSPL': 8,   // $600
    'price_1SuxMCLyFGkLiU4C8Q45qVPJ': 16,  // $1,200
    'price_1SuxO2LyFGkLiU4CRR7D14wh': 40,  // $3,000
    // Rapid Pilot
    'price_1SuxIMLyFGkLiU4CBoIEIfs8': 8,   // $299
  };

  return tokenMap[priceId] || 0;
}

/**
 * Build Stripe line items from cart
 */
async function buildLineItems(items: CartItem[]): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
  const stripeClient = getStripe();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const item of items) {
    let stripePriceId = item.priceId;

    const product = getProductByPriceId(item.priceId);
    if (product) {
      try {
        const prices = await stripeClient.prices.list({
          lookup_keys: [item.priceId],
        });
        if (prices.data.length > 0) {
          stripePriceId = prices.data[0].id;
        }
      } catch (error) {
        console.error('Error fetching price by lookup_key:', error);
      }
    }

    lineItems.push({
      price: stripePriceId,
      quantity: item.quantity,
    });
  }

  return lineItems;
}

/**
 * Log checkout event (customer lifecycle tracking placeholder)
 */
function logCheckoutEvent(accountId: string | undefined, intent: string): void {
  if (!accountId) return;
  console.log(`[checkout/session] Checkout started: account=${accountId}, intent=${intent}`);
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      items,
      customerId,
      email,
      successUrl,
      cancelUrl,
      promoCode,
      intent = 'SUBSCRIPTION',
      metadata = {},
    } = body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const stripeClient = getStripe();
    const db = getPrisma();

    // Determine mode based on intent
    const mode = determineCheckoutMode(items, intent);

    // Build line items
    const lineItems = await buildLineItems(items);

    // Get consultation details if applicable
    const consultationDetails = intent === 'CONSULTATION' ? getConsultationDetails(items) : null;

    // Get Stripe customer from billing customer (if account ID provided)
    let stripeCustomerId: string | undefined;
    if (customerId) {
      try {
        const billingCustomer = await db.billingCustomer.findUnique({
          where: { accountId: customerId },
        });
        stripeCustomerId = billingCustomer?.stripeCustomerId || undefined;
      } catch (error) {
        console.error('Error finding billing customer:', error);
      }
    }

    // Build success URL with intent-specific parameters
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://barriosa2i.com';
    let finalSuccessUrl = successUrl;
    if (!finalSuccessUrl) {
      let queryString = `session_id={CHECKOUT_SESSION_ID}&intent=${encodeURIComponent(intent)}`;
      if (consultationDetails) {
        queryString += `&calendly=${encodeURIComponent(consultationDetails.calendlyUrl)}`;
      }
      finalSuccessUrl = `${baseUrl}/checkout-success.html?${queryString}`;
    }

    // Build session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: lineItems,
      success_url: finalSuccessUrl,
      cancel_url: cancelUrl || `${baseUrl}/checkout-cancelled.html`,
      billing_address_collection: 'required',
      allow_promotion_codes: !promoCode,
      metadata: {
        ...metadata,
        source: 'barrios-a2i',
        intent,
        priceId: items[0]?.priceId,
        ...(intent === 'TOP_UP' && {
          tokens: String(getTokensForPriceId(items[0]?.priceId)),
        }),
        ...(consultationDetails && {
          consultationType: consultationDetails.consultationType,
          creditableTiers: consultationDetails.creditableTiers.join(','),
        }),
      },
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else if (email) {
      sessionParams.customer_email = email;
    }

    // Apply promo code if provided
    if (promoCode) {
      try {
        const promoCodes = await stripeClient.promotionCodes.list({
          code: promoCode,
          active: true,
        });
        if (promoCodes.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promoCodes.data[0].id }];
        }
      } catch (error) {
        console.error('Error applying promo code:', error);
      }
    }

    // Intent-specific configurations
    if (mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          ...metadata,
          source: 'barrios-a2i',
          intent,
        },
      };
      sessionParams.payment_method_types = ['card'];
    }

    // Consultation-specific: collect phone number for follow-up
    if (intent === 'CONSULTATION') {
      sessionParams.phone_number_collection = { enabled: true };
      sessionParams.custom_text = {
        submit: {
          message: "After payment, you'll be redirected to schedule your consultation.",
        },
      };
    }

    // Upgrade intent: Show trial period ending notice
    if (intent === 'UPGRADE') {
      sessionParams.custom_text = {
        submit: {
          message: "Your new plan will be active immediately. You'll be prorated for the remaining billing period.",
        },
      };
    }

    const session = await stripeClient.checkout.sessions.create(sessionParams);

    // Log checkout event
    logCheckoutEvent(customerId, intent);

    const duration = Date.now() - startTime;
    console.log(`[checkout/session] Created session ${session.id} (${duration}ms)`);

    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
        intent,
        ...(consultationDetails && {
          calendlyUrl: consultationDetails.calendlyUrl,
        }),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[checkout/session] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
