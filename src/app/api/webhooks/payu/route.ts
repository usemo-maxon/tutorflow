import { createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const header =
    request.headers.get("openpayu-signature") ??
    request.headers.get("x-openpayu-signature");
  if (!header || !validSignature(body, header))
    return Response.json({ ok: false }, { status: 401 });
  const payload = JSON.parse(body) as {
    order?: { orderId?: string; extOrderId?: string; status?: string };
  };
  const order = payload.order;
  if (!order?.orderId || !order.extOrderId || !order.status)
    return Response.json({ ok: false }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const externalId = `${order.orderId}:${order.status}`;
  const { data: existing } = await supabase
    .from("webhook_events")
    .select("external_id")
    .eq("provider", "payu")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return Response.json({ ok: true });
  if (order.status === "COMPLETED") {
    const { error } = await supabase.rpc("confirm_payu_order", {
      p_ext_order_id: order.extOrderId,
      p_payu_order_id: order.orderId,
    });
    if (error) return Response.json({ ok: false }, { status: 500 });
  } else {
    await supabase
      .from("payu_orders")
      .update({
        status: order.status.toLowerCase(),
        payu_order_id: order.orderId,
        updated_at: new Date().toISOString(),
      })
      .eq("ext_order_id", order.extOrderId)
      .neq("status", "completed");
  }
  await supabase.from("webhook_events").insert({
    provider: "payu",
    external_id: externalId,
    payload_hash: createHash("sha256").update(body).digest("hex"),
  });
  return Response.json({ ok: true });
}

export function validSignature(body: string, header: string) {
  const values = Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter((item) => item.length === 2),
  );
  if (
    values.algorithm?.toUpperCase() !== "MD5" ||
    !values.signature ||
    !process.env.PAYU_SECOND_KEY
  )
    return false;
  const expected = createHash("md5")
    .update(body + process.env.PAYU_SECOND_KEY)
    .digest("hex");
  const left = Buffer.from(values.signature.toLowerCase());
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
