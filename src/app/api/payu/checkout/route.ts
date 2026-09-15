import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentTeacher } from "@/server/auth";
import { siteUrl } from "@/server/env";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase";

const schema = z.object({ plan: z.enum(["monthly", "annual"]) });

export async function POST(request: Request) {
  try {
    const teacher = await currentTeacher();
    if (!teacher)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Zaloguj się ponownie.",
      });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Wybierz okres rozliczeniowy.",
      });
    const extOrderId = randomUUID();
    const amount = parsed.data.plan === "annual" ? 39000 : 3900;
    const supabase = await createSupabaseServerClient();
    const { error: insertError } = await supabase.from("payu_orders").insert({
      teacher_id: teacher.id,
      ext_order_id: extOrderId,
      plan: parsed.data.plan,
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
          parsed.data.plan === "annual"
            ? "easy4tutor — plan roczny"
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
