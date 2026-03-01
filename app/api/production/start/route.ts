/**
 * Production Start API
 *
 * Validates tokens, deducts atomically, and starts production.
 *
 * MODES:
 * - Manual Fulfillment (default): Emails Gary, waits for manual RAGNAROK trigger
 * - Automatic (MANUAL_FULFILLMENT_MODE=false): Auto-triggers RAGNAROK pipeline
 *
 * To switch modes, set environment variable:
 *   MANUAL_FULFILLMENT_MODE=false  -> Enable automatic RAGNAROK
 *   MANUAL_FULFILLMENT_MODE=true   -> Manual fulfillment (default)
 *
 * @route POST /api/production/start - Start new production
 * @route GET /api/production/start - Check token availability
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { TokenGuard, TOKEN_COSTS } from "@/lib/token-guard";
import { db } from "@/lib/db";
import { sendNewOrderNotificationEmail } from "@/lib/email-service";

// ============================================================================
// FULFILLMENT MODE TOGGLE
// Set MANUAL_FULFILLMENT_MODE=false in .env to enable automatic RAGNAROK
// ============================================================================
const MANUAL_FULFILLMENT_MODE = process.env.MANUAL_FULFILLMENT_MODE !== "false";

// ============================================================================
// POST /api/production/start
// Start a new video production (requires tokens)
// ============================================================================

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get account ID from Clerk user
    const accountId = await TokenGuard.getAccountIdFromClerkId(userId);
    if (!accountId) {
      return NextResponse.json(
        { error: "Account not found. Please complete onboarding." },
        { status: 404 }
      );
    }

    // Get customer info for order notification
    const account = await db.account.findUnique({
      where: { id: accountId },
      include: { owner: { select: { email: true, firstName: true, lastName: true } } },
    });

    const body = await req.json();

    // Extract creative brief from request
    const {
      title,
      script,
      targetAudience,
      brandVoice,
      format,
      duration,
      rushDelivery,
    } = body;

    // ===== 1. Validate Required Fields =====
    const errors: string[] = [];
    if (!title) errors.push("Title is required");
    if (!script) errors.push("Script is required");

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: errors,
        },
        { status: 400 }
      );
    }

    // ===== 2. Calculate Token Cost =====
    let tokenCost: number = TOKEN_COSTS.STANDARD_VIDEO;
    let priority: "STANDARD" | "EXPEDITED" | "PRIORITY" | "RUSH" = "STANDARD";

    if (rushDelivery) {
      tokenCost = TOKEN_COSTS.RUSH_VIDEO;
      priority = "RUSH";
    }

    // ===== 3. Check Token Balance =====
    const balanceCheck = await TokenGuard.checkBalance(accountId, tokenCost);

    if (!balanceCheck.success) {
      return NextResponse.json(
        {
          error: "Insufficient tokens",
          message: `You need ${tokenCost} token(s) but only have ${balanceCheck.balance}.`,
          currentBalance: balanceCheck.balance,
          required: tokenCost,
          deficit: tokenCost - balanceCheck.balance,
          purchaseUrl: "/creative-director#pricing",
        },
        { status: 402 }
      ); // Payment Required
    }

    // ===== 4. Deduct Tokens & Create Production (Atomic) =====
    const deductResult = await TokenGuard.deductForProduction(accountId, {
      title,
      script,
      targetAudience,
      brandVoice,
      format,
      duration,
      tokensRequired: tokenCost,
      priority,
    });

    if (!deductResult.success) {
      return NextResponse.json(
        {
          error: "Token deduction failed",
          message: deductResult.error,
        },
        { status: 500 }
      );
    }

    // ===== 5. Start Production (Manual or Automatic) =====

    if (MANUAL_FULFILLMENT_MODE) {
      // ========================================================================
      // MANUAL FULFILLMENT MODE (TEMPORARY)
      // ========================================================================
      // Send order notification to Gary for manual RAGNAROK trigger.
      // To disable this and enable automatic RAGNAROK, set:
      //   MANUAL_FULFILLMENT_MODE=false
      // in your environment variables.
      // ========================================================================

      const customerName = `${account?.owner?.firstName || ""} ${account?.owner?.lastName || ""}`.trim() || "Customer";
      const customerEmail = account?.owner?.email || "unknown";

      const emailResult = await sendNewOrderNotificationEmail({
        productionId: deductResult.productionId,
        customerName,
        customerEmail,
        accountId,
        title,
        script,
        targetAudience,
        brandVoice,
        format,
        duration,
        priority,
        tokensUsed: tokenCost,
        timestamp: new Date(),
      });

      console.log(`[Production] Manual mode - Order notification sent: ${emailResult.success}`);
      if (!emailResult.success) {
        console.error(`[Production] Email error: ${emailResult.error}`);
      }

      // ===== 6. Return Success Response (Manual Mode) =====
      return NextResponse.json({
        success: true,
        production: {
          id: deductResult.productionId,
          status: "QUEUED",
        },
        tokens: {
          used: tokenCost,
          remaining: deductResult.newBalance,
          ledgerEntryId: deductResult.ledgerEntryId,
        },
        message: "Order received! Our team will start production shortly and you'll receive an email when your commercial is ready.",
        dashboardUrl: `/dashboard/lab?production=${deductResult.productionId}`,
      });

    } else {
      // ========================================================================
      // AUTOMATIC RAGNAROK MODE
      // ========================================================================
      // Auto-trigger RAGNAROK pipeline for immediate processing.
      // This is the production mode when manual fulfillment is disabled.
      // ========================================================================

      const genesisUrl = process.env.GENESIS_API_URL || "https://api.barriosa2i.com";
      let pipelineStarted = false;
      let pipelineResponse: Record<string, unknown> | null = null;

      try {
        const response = await fetch(`${genesisUrl}/api/ragnarok/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GENESIS_API_KEY}`,
          },
          body: JSON.stringify({
            productionId: deductResult.productionId,
            accountId,
            title,
            script,
            targetAudience,
            brandVoice,
            format,
            duration,
            priority: rushDelivery ? "rush" : "standard",
          }),
        });

        if (response.ok) {
          pipelineStarted = true;
          pipelineResponse = await response.json();
          console.log(`[Production] RAGNAROK started: ${deductResult.productionId}`);
        } else {
          console.error("[Production] RAGNAROK failed:", await response.text());
        }
      } catch (err) {
        console.error("[Production] GENESIS connection error:", err);
      }

      // ===== 6. Return Success Response (Automatic Mode) =====
      return NextResponse.json({
        success: true,
        production: {
          id: deductResult.productionId,
          status: "QUEUED",
          estimatedMinutes: rushDelivery ? 2 : 4,
        },
        tokens: {
          used: tokenCost,
          remaining: deductResult.newBalance,
          ledgerEntryId: deductResult.ledgerEntryId,
        },
        pipeline: {
          started: pipelineStarted,
          genesisResponse: pipelineResponse,
        },
        message: pipelineStarted
          ? "Production started! Your commercial is being created by RAGNAROK."
          : "Production queued. We'll start processing shortly.",
        dashboardUrl: `/dashboard/lab?production=${deductResult.productionId}`,
      });
    }
  } catch (error) {
    console.error("[Production] Start error:", error);
    return NextResponse.json(
      {
        error: "Failed to start production",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/production/start
// Pre-flight check: Can user start a production?
// ============================================================================

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accountId = await TokenGuard.getAccountIdFromClerkId(userId);
    if (!accountId) {
      return NextResponse.json(
        {
          canStart: false,
          error: "Account not found",
          message: "Please complete onboarding to access Commercial Lab.",
        },
        { status: 404 }
      );
    }

    const balanceCheck = await TokenGuard.checkBalance(
      accountId,
      TOKEN_COSTS.STANDARD_VIDEO
    );
    const balanceDetails = await TokenGuard.getBalanceDetails(accountId);

    return NextResponse.json({
      canStart: balanceCheck.success,
      tokenCost: TOKEN_COSTS.STANDARD_VIDEO,
      rushCost: TOKEN_COSTS.RUSH_VIDEO,
      balance: {
        current: balanceCheck.balance,
        lifetime: balanceDetails?.lifetimeTokens ?? 0,
        used: balanceDetails?.tokensUsed ?? 0,
      },
      subscription: {
        tier: balanceDetails?.subscriptionTier,
        monthlyAllocation: balanceDetails?.monthlyAllocation ?? 0,
      },
      message: balanceCheck.success
        ? `Ready to create! You have ${balanceCheck.balance} token(s).`
        : `You need ${TOKEN_COSTS.STANDARD_VIDEO} token to start. Purchase tokens to continue.`,
      purchaseUrl: "/creative-director#pricing",
    });
  } catch (error) {
    console.error("[Production] Check error:", error);
    return NextResponse.json(
      {
        error: "Failed to check production availability",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
