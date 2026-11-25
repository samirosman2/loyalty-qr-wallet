export type CardStatus = "pending" | "active" | "blocked";
export type WalletPlatform = "apple" | "google" | "samsung" | "web";
export type TransactionType = "earn" | "redeem" | "adjust";

export interface Shop {
  id: string;
  owner_user_id: string | null;
  name: string;
  slug: string;
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
