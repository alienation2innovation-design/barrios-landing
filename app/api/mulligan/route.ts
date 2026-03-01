/**
 * Mulligan API - Free Video Recreation WITH Customer Feedback
 *
 * Accepts customer feedback about what they want changed
 * and passes it to RAGNAROK for intelligent recreation.
 *
 * @route GET /api/mulligan?token=xxx (redirects to feedback page)
 * @route POST /api/mulligan (process with feedback)
 * @route HEAD /api/mulligan?token=xxx (availability check)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { TokenGuard } from "@/lib/token-guard";

// ============================================================================
// Types
// ============================================================================

interface MulliganFeedback {
  categories: string[];
  details: string;
  priorityLevel: "subtle" | "moderate" | "significant";
  submittedAt: string;
}

// ============================================================================
// Feedback Category Labels (for prompt engineering)
// ============================================================================

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  pacing: "Pacing & Energy - adjust the tempo, cuts, and overall energy level",
  visuals:
    "Visual Style - modify colors, transitions, graphics, and aesthetic",
  voice: "Voice & Audio - change voiceover style, tone, music, or sound effects",
  message: "Message & Script - emphasize different points, adjust the narrative",
  format: "Format & Length - modify duration, aspect ratio, or structure",
  other: "Other specific changes requested by the customer",
};

const PRIORITY_INSTRUCTIONS: Record<string, string> = {
  subtle:
    "Make SUBTLE refinements while keeping the overall feel similar. Polish and improve without dramatically changing the approach.",
  moderate:
    "Create a FRESH TAKE with noticeable changes while maintaining the core message. Feel free to try new creative directions.",
  significant:
    "SIGNIFICANTLY OVERHAUL the commercial. Take a completely different creative approach while still promoting the same business/product.",
};

// ============================================================================
// GET /api/mulligan?token=xxx
// Redirect to feedback page instead of processing directly
// ============================================================================

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.barriosa2i.com";

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=invalid_mulligan`);
  }

  // Redirect to feedback page
  return NextResponse.redirect(`${baseUrl}/mulligan/${token}`);
}

// ============================================================================
// POST /api/mulligan
// Process mulligan with customer feedback
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, productionId, feedback } = body as {
      token?: string;
      productionId?: string;
      feedback?: MulliganFeedback;
    };

    // Validate - need token (from email) or productionId (from dashboard)
    if (!token && !productionId) {
      return NextResponse.json(
        { error: "Missing mulligan token or production ID" },
        { status: 400 }
      );
    }

    // Find production
    let production;

    if (token) {
      // Email link flow (token-based auth)
      production = await db.production.findUnique({
        where: { mulliganToken: token },
        include: {
          account: {
            include: {
              labSubscription: {
                include: {
                  cycles: {
                    where: {
                      periodStart: { lte: new Date() },
                      periodEnd: { gte: new Date() },
                    },
                    orderBy: { cycleNumber: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
    } else {
      // Dashboard flow - verify ownership
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Get account ID from user
      const accountId = await TokenGuard.getAccountIdFromClerkId(userId);
      if (!accountId) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }

      production = await db.production.findFirst({
        where: {
          id: productionId,
          accountId,
        },
        include: {
          account: {
            include: {
              labSubscription: {
                include: {
                  cycles: {
                    where: {
                      periodStart: { lte: new Date() },
                      periodEnd: { gte: new Date() },
                    },
                    orderBy: { cycleNumber: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
    }

    // ===== Validation =====

    if (!production) {
      return NextResponse.json(
        { error: "Production not found or link expired" },
        { status: 404 }
      );
    }

    if (production.mulliganUsed) {
      // Check balance for paid redo
      const balanceCheck = await TokenGuard.checkBalance(
        production.accountId,
        1
      );
      return NextResponse.json(
        {
          error: "Mulligan already used",
          message:
            "You've already used your free recreation for this commercial. Additional recreations cost 1 token.",
          canPurchase: balanceCheck.success,
          currentBalance: balanceCheck.balance,
        },
        { status: 400 }
      );
    }

    if (production.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Production not complete",
          message:
            "Please wait for your video to complete before using your mulligan.",
          status: production.status,
        },
        { status: 400 }
      );
    }

    // ===== Build Recreation Instructions =====

    const recreationInstructions = buildRecreationInstructions(
      feedback,
      production.title
    );

    // ===== Process Mulligan (Atomic Transaction) =====

    const newMulliganToken = generateSecureToken();
    const cycle = production.account.labSubscription?.cycles[0];

    const { newProduction } = await db.$transaction(async (tx) => {
      // 1. Mark original as mulligan used
      await tx.production.update({
        where: { id: production.id },
        data: { mulliganUsed: true },
      });

      // 2. Create new production with feedback embedded
      const newProd = await tx.production.create({
        data: {
          accountId: production.accountId,
          title: `${production.title} (Mulligan)`,
          script: production.script,
          targetAudience: production.targetAudience,
          brandVoice: production.brandVoice,
          format: production.format,
          duration: production.duration,
          tokensRequired: 0, // FREE mulligan
          tokensConsumed: 0,
          status: "QUEUED",
          priority: production.priority,
          queuedAt: new Date(),
          mulliganUsed: false,
          mulliganToken: newMulliganToken,
          originalId: production.id,
        },
      });

      // 3. Log transaction (0 tokens but tracked for analytics)
      if (cycle) {
        await tx.tokenLedgerEntry.create({
          data: {
            cycleId: cycle.id,
            type: "DEBIT_PRODUCTION",
            amount: 0,
            balance:
              cycle.tokensAllocated - cycle.tokensUsed - cycle.tokensExpired,
            referenceType: "mulligan",
            referenceId: newProd.id,
            idempotencyKey: `mulligan_${newProd.id}`,
            description: `Free mulligan (${feedback?.priorityLevel || "moderate"} changes): ${production.title}`,
          },
        });
      }

      return { newProduction: newProd };
    });

    // ===== Trigger RAGNAROK with Feedback =====

    await triggerRAGNAROKWithFeedback(
      newProduction.id,
      production,
      feedback,
      recreationInstructions
    );

    console.log(`[Mulligan] ✅ Recreation started: ${newProduction.id}`);
    console.log(
      `[Mulligan] Feedback: ${feedback?.categories?.join(", ") || "none"}`
    );
    console.log(`[Mulligan] Priority: ${feedback?.priorityLevel || "moderate"}`);

    return NextResponse.json({
      success: true,
      message:
        "Mulligan activated! Your feedback has been sent to our AI director.",
      newProductionId: newProduction.id,
      originalProductionId: production.id,
      feedbackReceived: {
        categories: feedback?.categories || [],
        priorityLevel: feedback?.priorityLevel || "moderate",
        hasDetails: !!feedback?.details,
      },
      estimatedMinutes: 4,
    });
  } catch (error) {
    console.error("[Mulligan] Error:", error);
    return NextResponse.json(
      { error: "Failed to process mulligan. Please try again." },
      { status: 500 }
    );
  }
}

// ============================================================================
// HEAD /api/mulligan?token=xxx
// Check mulligan availability without processing
// ============================================================================

export async function HEAD(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(null, { status: 400 });
  }

  const production = await db.production.findUnique({
    where: { mulliganToken: token },
    select: { mulliganUsed: true, status: true },
  });

  if (!production) {
    return new NextResponse(null, { status: 404 });
  }

  const headers = new Headers();

  if (production.mulliganUsed) {
    headers.set("X-Mulligan-Status", "used");
    return new NextResponse(null, { status: 410 }); // Gone
  }

  if (production.status !== "COMPLETED") {
    headers.set("X-Mulligan-Status", "pending");
    return new NextResponse(null, { status: 425 }); // Too Early
  }

  headers.set("X-Mulligan-Status", "available");
  return new NextResponse(null, { status: 200, headers });
}

// ============================================================================
// Build Recreation Instructions for RAGNAROK
// ============================================================================

function buildRecreationInstructions(
  feedback: MulliganFeedback | undefined,
  title: string | null
): string {
  if (!feedback) {
    return "Create a fresh variation with different creative direction while maintaining the core message.";
  }

  const parts: string[] = [];

  // Header
  parts.push("=== MULLIGAN RECREATION REQUEST ===");
  parts.push(`Production: ${title || "Commercial"}`);
  parts.push("");

  // Priority level instruction
  parts.push("## CHANGE INTENSITY");
  parts.push(
    PRIORITY_INSTRUCTIONS[feedback.priorityLevel] ||
      PRIORITY_INSTRUCTIONS.moderate
  );
  parts.push("");

  // Categories to change
  if (feedback.categories && feedback.categories.length > 0) {
    parts.push("## AREAS TO FOCUS ON");
    for (const category of feedback.categories) {
      const description = CATEGORY_DESCRIPTIONS[category] || category;
      parts.push(`• ${description}`);
    }
    parts.push("");
  }

  // Detailed feedback
  if (feedback.details && feedback.details.trim()) {
    parts.push("## SPECIFIC CUSTOMER FEEDBACK");
    parts.push(
      "The customer has provided the following specific instructions:"
    );
    parts.push("");
    parts.push("---");
    parts.push(feedback.details.trim());
    parts.push("---");
    parts.push("");
    parts.push("Please carefully address each point in their feedback.");
  }

  // Closing instruction
  parts.push("");
  parts.push("## IMPORTANT");
  parts.push(
    "This is a mulligan recreation - the customer was not fully satisfied with the original."
  );
  parts.push(
    "Focus on the areas they identified while maintaining brand consistency."
  );

  return parts.join("\n");
}

// ============================================================================
// Trigger RAGNAROK Pipeline with Feedback
// ============================================================================

async function triggerRAGNAROKWithFeedback(
  newProductionId: string,
  original: {
    id: string;
    title: string;
    script: string;
    targetAudience: string | null;
    brandVoice: string | null;
    format: string;
    duration: number;
  },
  feedback: MulliganFeedback | undefined,
  instructions: string
) {
  const genesisUrl =
    process.env.GENESIS_API_URL ||
    "https://api.barriosa2i.com";

  try {
    const response = await fetch(`${genesisUrl}/api/ragnarok/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GENESIS_API_KEY}`,
      },
      body: JSON.stringify({
        productionId: newProductionId,
        isMulligan: true,
        originalProductionId: original.id,
        title: original.title,
        script: original.script,
        targetAudience: original.targetAudience,
        brandVoice: original.brandVoice,
        format: original.format,
        duration: original.duration,

        // ===== CUSTOMER FEEDBACK =====
        mulliganFeedback: feedback,
        mulliganInstructions: instructions,

        // Formatted for Creative Director agent
        creativeDirection: instructions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Mulligan] RAGNAROK error:", errorText);
    } else {
      const data = await response.json();
      console.log("[Mulligan] RAGNAROK started:", data);
    }
  } catch (error) {
    console.error("[Mulligan] RAGNAROK connection error:", error);
    // Don't throw - production record exists, can be retried
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateSecureToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return [8, 4, 4, 12]
    .map((len) =>
      Array.from({ length: len }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("")
    )
    .join("-");
}
