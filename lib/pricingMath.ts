/**
 * Gross-margin → price-multiple conversions shown on the owner-only pricing
 * screens (MRM-002 in docs/model-risk/MODEL_INVENTORY.md).
 *
 * These only PREVIEW the price; the server applies the real one. They were
 * inlined in two components with different edge handling, which is why they
 * live here now: so the validation suite can hold both to the same formula
 * (price = cost / (1 - margin)) and surface where they disagree. Behaviour is
 * unchanged from the inlined versions.
 */

/** BillingPricingAdmin: clamps margin into [0, 95] and always returns a multiple. */
export const marginMultiplier = (margin: number) => {
  const safe = Math.min(Math.max(Number(margin) || 0, 0), 95);
  return 1 / (1 - safe / 100);
};

/** TenantEconomicsAdmin: rejects margins outside (0, 100) and rounds to 3 dp. */
export const tenantMarginMultiple = (input: string | number): number | null => {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || value >= 100) return null;
  return Math.round((100 / (100 - value)) * 1000) / 1000;
};
