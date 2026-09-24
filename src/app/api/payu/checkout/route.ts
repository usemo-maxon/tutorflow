import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FOUNDER_SLOT_LIMIT } from "@/lib/pricing";
import { currentTeacher } from "@/server/auth";
import { siteUrl } from "@/server/env";
import { ApiFailure, errorResponse } from "@/server/errors";
import {
  parseCheckoutProduct,
  payuAmountForProduct,
} from "@/server/payu-pricing";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/server/supabase";

export async function GET() {
  try {
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    return Response.json({
      founderAvailable:
        teacher.subscription.tier === "founder" ||
        (await hasFounderAvailability(createSupabaseAdminClient())),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await currentTeacher();
    if (!teacher) throw unauthenticated();
    const plan = parseCheckoutProduct(await request.json());
    if (!plan)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Wybierz okres rozliczeniowy.",
      });
    const extOrderId = randomUUID();
    const supabase = await createSupabaseServerClient();
    const founderEligible =
      plan === "monthly" &&
      teacher.subscription.tier !== "founder" &&
      (await hasFounderAvailability(createSupabaseAdminClient()));
    const amount = payuAmountForProduct(plan, founderEligible);
    const { error: insertError } = await supabase.from("payu_orders").insert({
      teacher_id: teacher.id,
      ext_order_id: extOrderId,
      plan,
      amount_grosz: amount,
    });
    if (insertError) throw insertError;
    const base = process.env.PAYU_API_BASE_URL ?? "https://secure.payu.com";
    const tokenResponse = await fetch(
      `${base}/pl/standard/user/oauth/authorize`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.PAYU_POS_ID!,
          client_secret: process.env.PAYU_CLIENT_SECRET!,
        }),
      },
    );
    if (!tokenResponse.ok) throw new Error("PAYU_AUTH_FAILED");
    const token = (await tokenResponse.json()) as { access_token: string };
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";
    const orderResponse = await fetch(`${base}/api/v2_1/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        notifyUrl: `${siteUrl()}/api/webhooks/payu`,
        continueUrl: `${siteUrl()}/app/ustawienia/subskrypcja?payment=processing`,
        customerIp: ip,
        merchantPosId: process.env.PAYU_POS_ID,
        description:
          plan === "annual"
            ? "easy4tutor — plan roczny"
            : founderEligible
              ? "easy4tutor — oferta Founder"
              : "easy4tutor — plan miesięczny",
        currencyCode: "PLN",
        totalAmount: String(amount),
        extOrderId,
        buyer: { email: teacher.email, language: "pl" },
        products: [
          {
            name: "Subskrypcja easy4tutor",
            unitPrice: String(amount),
            quantity: "1",
          },
        ],
      }),
    });
    const response = (await orderResponse.json()) as {
      redirectUri?: string;
      orderId?: string;
      status?: { statusCode?: string };
    };
    if (!response.redirectUri || !response.orderId)
      throw new Error("PAYU_ORDER_FAILED");
    await supabase
      .from("payu_orders")
      .update({
        payu_order_id: response.orderId,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("ext_order_id", extOrderId);
    return Response.json({ redirectUrl: response.redirectUri });
  } catch (error) {
    return errorResponse(error);
  }
}

function unauthenticated() {
  return new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Zaloguj się ponownie.",
  });
}

async function hasFounderAvailability(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("subscriptions")
    .select("teacher_id", { count: "exact", head: true })
    .eq("tier", "founder")
    .eq("status", "active");
  if (error) throw error;
  return (count ?? FOUNDER_SLOT_LIMIT) < FOUNDER_SLOT_LIMIT;
}
