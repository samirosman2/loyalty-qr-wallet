export type CardStatus = "pending" | "active" | "blocked";
export type WalletPlatform = "apple" | "google" | "samsung" | "web";
export type TransactionType = "earn" | "redeem" | "adjust";

export interface LoyaltyBrand {
  id: string;
  name: string;
  plan_tier: "starter" | "growth" | "pro";
  max_branches: number;
}

export interface Shop {
  id: string;
  owner_user_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand_id: string | null;
  is_active: boolean;
  require_card_approval: boolean;
  points_per_purchase: number;
  currency: string;
  created_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface LoyaltyCard {
  id: string;
  shop_id: string;
  customer_id: string;
  card_code: string;
  status: CardStatus;
  points_balance: number;
  wallet_platform: WalletPlatform | null;
  wallet_pass_serial: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  shop_id: string;
  title: string;
  description: string | null;
  points_required: number;
  is_active: boolean;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  shop_id: string;
  card_id: string;
  reward_id: string | null;
  type: TransactionType;
  points_delta: number;
  idempotency_key: string | null;
  performed_by: string | null;
  note: string | null;
  created_at: string;
  purchase_amount: number | null;
  bill_reference: string | null;
}

export interface CustomerVoucher {
  id: string;
  voucher_code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  status: "active" | "redeemed" | "expired";
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

export type PublicVoucher = Pick<CustomerVoucher, "discount_type" | "discount_value" | "status" | "issued_at" | "expires_at" | "redeemed_at">;

export interface SpendVoucherRule {
  id: string;
  name: string;
  min_spend_amount: number;
  window_days: number;
  discount_type: "percent" | "fixed";
  discount_value: number;
  voucher_valid_days: number;
  is_active: boolean;
}

export type ProcessLoyaltyTransactionStatus =
  | "success"
  | "duplicate"
  | "card_not_found"
  | "card_not_active"
  | "insufficient_points"
  | "invalid_type"
  | "idempotency_conflict";

export interface ProcessLoyaltyTransactionResult {
  status: ProcessLoyaltyTransactionStatus;
  card_id: string | null;
  new_balance: number | null;
}
