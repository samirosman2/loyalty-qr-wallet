"use client";

import { useEffect } from "react";

export const LAST_CARD_KEY = "loyalty_last_card_code";

export default function RememberCard({ cardCode }: { cardCode: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(LAST_CARD_KEY, cardCode);
    } catch {
      // storage unavailable (private mode); the card still works via its URL
    }
  }, [cardCode]);
  return null;
}
