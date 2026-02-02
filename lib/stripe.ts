import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});

// Nexus Personal Price IDs - requires environment variables
export const NEXUS_PRICE_IDS = {
  installation: process.env.NEXUS_INSTALLATION_PRICE_ID!,
  maintenance: process.env.NEXUS_MAINTENANCE_PRICE_ID!,
  houseCall: process.env.NEXUS_HOUSE_CALL_PRICE_ID!,
  familyTraining: process.env.NEXUS_FAMILY_TRAINING_PRICE_ID!,
  prioritySetup: process.env.NEXUS_PRIORITY_SETUP_PRICE_ID!,
} as const;

// Addon mapping for checkout
export const NEXUS_ADDON_MAP: Record<string, { priceId: string; name: string; amount: number }> = {
  'house-call': {
    priceId: NEXUS_PRICE_IDS.houseCall,
    name: 'House Call',
    amount: 15000, // $150
  },
  'family-training': {
    priceId: NEXUS_PRICE_IDS.familyTraining,
    name: 'Family Training',
    amount: 9900, // $99
  },
  'priority-setup': {
    priceId: NEXUS_PRICE_IDS.prioritySetup,
    name: 'Priority Setup',
    amount: 7500, // $75
  },
};

// Helper to get or create a Stripe customer by email
export async function getOrCreateCustomer(email: string, name?: string): Promise<Stripe.Customer> {
  // Search for existing customer
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  return await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      source: 'nexus_personal_checkout',
    },
  });
}

export default stripe;
