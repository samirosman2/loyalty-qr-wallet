import { Suspense } from "react";
import { notFound } from "next/navigation";
import CardQr from "@/components/CardQr";
import RememberCard from "@/components/RememberCard";
import SaveCardPrompt from "@/components/SaveCardPrompt";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Customer, LoyaltyCard, Reward, Shop } from "@/types/loyalty";

async function CardView({ params }: { params: Promise<{ cardCode: string }> }) {
  const { cardCode: rawCode } = await params;
  const cardCode = decodeURIComponent(rawCode);
  const supabase = createSupabaseAdminClient();

  const { data: card } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("card_code", cardCode)
    .maybeSingle<LoyaltyCard>();
  if (!card) notFound();

  const [{ data: shop }, { data: customer }, { data: rewards }] = await Promise.all([
    supabase.from("shops").select("*").eq("id", card.shop_id).single<Shop>(),
    supabase.from("customers").select("*").eq("id", card.customer_id).single<Customer>(),
    supabase
      .from("rewards")
      .select("*")
      .eq("shop_id", card.shop_id)
      .eq("is_active", true)
      .order("points_required", { ascending: true })
      .returns<Reward[]>(),
  ]);
  if (!shop || !customer) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-zinc-50 px-4 py-6">
      <RememberCard cardCode={card.card_code} />
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg">
        <p className="text-sm uppercase tracking-wide text-indigo-100">{shop.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{customer.full_name}</h1>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <p className="text-sm text-indigo-100">Points</p>
            <p className="text-5xl font-bold tabular-nums">{card.points_balance}</p>
          </div>
          {card.status !== "active" && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium capitalize">
              {card.status}
            </span>
          )}
        </div>
        <div className="mt-6 flex flex-col items-center rounded-2xl bg-white p-4 text-zinc-900">
          <CardQr value={card.card_code} />
          <p className="mt-3 font-mono text-sm tracking-wider">{card.card_code}</p>
        </div>
      </section>

      <SaveCardPrompt />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Rewards</h2>
        {(rewards ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No rewards available yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(rewards ?? []).map((reward) => {
              const unlocked = card.points_balance >= reward.points_required;
              const remaining = reward.points_required - card.points_balance;
              const progress = Math.min(100, (card.points_balance / reward.points_required) * 100);
              return (
                <li key={reward.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">{reward.title}</p>
                      {reward.description && <p className="mt-0.5 text-sm text-zinc-500">{reward.description}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        unlocked ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {reward.points_required} pts
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full ${unlocked ? "bg-emerald-500" : "bg-indigo-500"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className={`mt-2 text-sm ${unlocked ? "font-medium text-emerald-700" : "text-zinc-500"}`}>
                    {unlocked ? "Unlocked" : `${remaining} more ${remaining === 1 ? "point" : "points"} to go`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function CardPage({ params }: { params: Promise<{ cardCode: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50 p-6 text-center text-zinc-500">Loading your card…</main>}>
      <CardView params={params} />
    </Suspense>
  );
}
