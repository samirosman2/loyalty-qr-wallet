create extension if not exists "pgcrypto";

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text unique not null,
  description text,
  require_card_approval boolean not null default false,
  points_per_purchase int not null default 1,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

-- For databases created before `description` existed:
alter table public.shops add column if not exists description text;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  constraint email_or_phone_required check (email is not null or phone is not null)
);

create table public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  card_code text unique not null,
  status text not null default 'active' check (status in ('pending', 'active', 'blocked')),
  points_balance int not null default 0 check (points_balance >= 0),
  wallet_platform text check (wallet_platform in ('apple', 'google', 'samsung', 'web')),
  wallet_pass_serial text unique,
  created_at timestamptz not null default now(),
  unique (shop_id, customer_id)
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null,
  description text,
  points_required int not null check (points_required > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  card_id uuid not null references public.loyalty_cards(id) on delete cascade,
  reward_id uuid references public.rewards(id) on delete set null,
  type text not null check (type in ('earn', 'redeem', 'adjust')),
  points_delta int not null,
  idempotency_key text unique,
  performed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index idx_loyalty_cards_card_code on public.loyalty_cards(card_code);
create index idx_loyalty_cards_shop_id on public.loyalty_cards(shop_id);
create index idx_point_transactions_card_id on public.point_transactions(card_id);
create index idx_rewards_shop_id on public.rewards(shop_id);

drop function if exists public.process_loyalty_transaction(text, text, int, uuid, text, text);

create or replace function public.process_loyalty_transaction(
  p_card_code text,
  p_type text,
  p_points_delta int,
  p_reward_id uuid default null,
  p_idempotency_key text default null,
  p_note text default null,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_card public.loyalty_cards%rowtype;
  v_existing public.point_transactions%rowtype;
  v_new_balance int;
begin
  -- Lock the card first so concurrent retries with the same key are serialized.
  select * into v_card
  from public.loyalty_cards
  where card_code = p_card_code
  for update;

  if not found then
    return jsonb_build_object('status', 'card_not_found', 'card_id', null, 'new_balance', null);
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.point_transactions
    where idempotency_key = p_idempotency_key;

    if found then
      if v_existing.card_id <> v_card.id then
        return jsonb_build_object('status', 'idempotency_conflict', 'card_id', v_card.id, 'new_balance', v_card.points_balance);
      end if;
      return jsonb_build_object('status', 'duplicate', 'card_id', v_card.id, 'new_balance', v_card.points_balance);
    end if;
  end if;

  if p_type not in ('earn', 'redeem', 'adjust') then
    return jsonb_build_object('status', 'invalid_type', 'card_id', v_card.id, 'new_balance', v_card.points_balance);
  end if;

  if v_card.status <> 'active' then
    return jsonb_build_object('status', 'card_not_active', 'card_id', v_card.id, 'new_balance', v_card.points_balance);
  end if;

  if v_card.points_balance + p_points_delta < 0 then
    return jsonb_build_object('status', 'insufficient_points', 'card_id', v_card.id, 'new_balance', v_card.points_balance);
  end if;

  insert into public.point_transactions (
    shop_id, card_id, reward_id, type, points_delta, idempotency_key, performed_by, note
  ) values (
    v_card.shop_id, v_card.id, p_reward_id, p_type, p_points_delta, p_idempotency_key, coalesce(p_performed_by, auth.uid()), p_note
  );

  update public.loyalty_cards
  set points_balance = points_balance + p_points_delta
  where id = v_card.id
  returning points_balance into v_new_balance;

  return jsonb_build_object('status', 'success', 'card_id', v_card.id, 'new_balance', v_new_balance);
end;
$$;