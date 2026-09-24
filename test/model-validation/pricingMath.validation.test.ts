import { describe, it, expect } from "vitest";
import { marginMultiplier, tenantMarginMultiple } from "../../lib/pricingMath";

/*
 * MRM-002 — Gross-margin price multiple (lib/pricingMath.ts).
 *
 * The owner sets a gross margin; the screens preview price = cost / (1 − m).
 * The server does the actual charging, so the risk here is an owner making a
 * pricing decision off a preview that does not match what gets saved.
 */

describe("MRM-002 margin multiple — conceptual soundness", () => {
  it("matches the gross-margin identity on reference points", () => {
    // The explanatory copy on the pricing screen quotes these two numbers.
    expect(marginMultiplier(40)).toBeCloseTo(1.6667, 4);
    expect(marginMultiplier(70)).toBeCloseTo(3.3333, 4);
    expect(tenantMarginMultiple(40)).toBe(1.667);
    expect(tenantMarginMultiple(70)).toBe(3.333);
    // Round-trip: charging cost × multiple leaves exactly m% of the price as margin.
    for (const m of [5, 25, 50, 80, 95]) {
      const price = 100 * marginMultiplier(m);
      expect((price - 100) / price).toBeCloseTo(m / 100, 10);
    }
  });

  it("is strictly increasing across the accepted range and never below 1×", () => {
    let prev = 0;
    for (let m = 0; m <= 95; m += 0.5) {
      const x = marginMultiplier(m);
      expect(x).toBeGreaterThan(prev);
      expect(x).toBeGreaterThanOrEqual(1);
      prev = x;
    }
  });

  it("never produces Infinity or NaN for any input", () => {
    for (const v of [-1e9, -1, 0, 99.999, 100, 150, NaN, Infinity, -Infinity]) {
      expect(Number.isFinite(marginMultiplier(v))).toBe(true);
    }
    for (const v of ["", "abc", "100", "-5", "NaN"]) expect(tenantMarginMultiple(v)).toBeNull();
  });

  it("both screens agree (to display precision) across (0, 95]", () => {
    for (let m = 0.5; m <= 95; m += 0.5) {
      expect(tenantMarginMultiple(m)).toBeCloseTo(marginMultiplier(m), 2);
    }
  });
});

describe("MRM-002 margin multiple — known limitations (open findings)", () => {
  it.fails("F-05a: Tenant Economics previews a multiple for margins its own save rejects", () => {
    // saveMargin() refuses anything above 95, but the preview renders 99 → 100×.
    expect(tenantMarginMultiple(96)).toBeNull();
    expect(tenantMarginMultiple(99)).toBeNull();
  });

  it.fails("F-05b: Billing Pricing clamps the preview but submits the raw value", () => {
    // Typing 99 previews 20× (the 95% clamp) while save() sends 99 to the
    // server unvalidated. The preview hides what is actually being submitted.
    expect(marginMultiplier(99)).not.toBe(marginMultiplier(95));
  });
});
