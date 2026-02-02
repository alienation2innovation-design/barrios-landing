// =============================================================================
// POST /api/checkout/nexus - Create Stripe Checkout Session for Nexus Personal
// Uses payment mode for installation + addons, subscription created via webhook
// Next.js App Router API Route
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { stripe, NEXUS_PRICE_IDS, NEXUS_ADDON_MAP, getOrCreateCustomer } from '@/lib/stripe';
import type Stripe from 'stripe';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface NexusCheckoutRequest {
  email: string;
  addons?: string[];
  includeMaintenance?: boolean;
  name?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: NexusCheckoutRequest = await request.json();
    const {
      email,
      addons = [],
      includeMaintenance = true,
      name,
    } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(email, name);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://barriosa2i.com';

    // Calculate addon details
    const selectedAddons = addons
      .filter((addon) => NEXUS_ADDON_MAP[addon])
      .map((addon) => NEXUS_ADDON_MAP[addon]);

    const addonTotal = selectedAddons.reduce((sum, addon) => sum + addon.amount, 0);
    const installationAmount = 75900; // $759.00

    // Build metadata for tracking
    const checkoutMetadata: Record<string, string> = {
      source: 'nexus_personal',
      product: 'nexus',
      installation_amount: String(installationAmount),
      addon_total: String(addonTotal),
      addons: addons.join(','),
      include_maintenance: String(includeMaintenance),
      customer_email: email,
      maintenance_price_id: includeMaintenance ? NEXUS_PRICE_IDS.maintenance : '',
    };

    // Build line items - always payment mode for one-time charges
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      // Installation fee
      {
        price: NEXUS_PRICE_IDS.installation,
        quantity: 1,
      },
      // Add selected addons
      ...selectedAddons.map((addon) => ({
        price: addon.priceId,
        quantity: 1,
      })),
    ];

    // Build custom message
    let submitMessage = `You will be charged $${((installationAmount + addonTotal) / 100).toFixed(2)} for installation`;
    if (selectedAddons.length > 0) {
      submitMessage += ` and add-ons`;
    }
    if (includeMaintenance) {
      submitMessage += `. A $49.99/month maintenance subscription will be created after purchase.`;
    } else {
      submitMessage += `. Note: Without maintenance, you will not receive monthly updates or priority support.`;
    }

    // Create checkout session in payment mode
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      line_items: lineItems,
      success_url: `${baseUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}&product=nexus&maintenance=${includeMaintenance}`,
      cancel_url: `${baseUrl}/nexus-personal#pricing`,
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      metadata: checkoutMetadata,
      payment_intent_data: {
        metadata: checkoutMetadata,
      },
      custom_text: {
        submit: {
          message: submitMessage,
        },
      },
    });

    const duration = Date.now() - startTime;
    console.log(
      `[checkout/nexus] Created session ${session.id} for ${email} (payment mode, maintenance=${includeMaintenance}, ${addons.length} addons) - ${duration}ms`
    );

    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
        mode: 'payment',
        customer: customer.id,
        willCreateSubscription: includeMaintenance,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[checkout/nexus] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
