// ============================================================
//  Pricing helpers — shared offer/packaging price math
// ============================================================
//  Centralises the two pieces of price logic the app reuses:
//   - effectivePrice: the per-base-unit price, honouring an active offer.
//   - unitEffectivePrice: the price of one packaging unit (a product_units
//     row), honouring the unit discount / explicit override AND the offer.
//  Kept in one place so the cart, checkout, market and detail endpoints
//  cannot drift apart.
// ============================================================

/**
 * Per-base-unit price: the offer price only while the offer is active,
 * otherwise the base price. Accepts a raw product row.
 *
 * @param {object} product row with price / has_offer / offer_price / offer_ends_at
 * @returns {number}
 */
function effectivePrice(product) {
  const hasOffer = product.has_offer === 1 || product.has_offer === true;
  const offerValid =
    hasOffer &&
    product.offer_price !== null &&
    product.offer_price !== undefined &&
    (!product.offer_ends_at || new Date(product.offer_ends_at) > new Date());
  return offerValid ? Number(product.offer_price) : Number(product.price);
}

/**
 * Round to 2 decimals, returning a Number (not a string).
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Number(Number(n).toFixed(2));
}

/**
 * Price of a single packaging unit.
 *
 *  - If the unit has an explicit final_price it is used as-is (an override of
 *    the whole calculation).
 *  - Otherwise: base_unit_price * units_count * (1 - discount_percent/100),
 *    where base_unit_price already reflects any active product offer.
 *
 * @param {object} product product row (for the offer-aware base price)
 * @param {object} unit     product_units row
 * @returns {number}
 */
function unitEffectivePrice(product, unit) {
  if (
    unit &&
    unit.final_price !== null &&
    unit.final_price !== undefined &&
    unit.final_price !== ''
  ) {
    return round2(unit.final_price);
  }
  const base = effectivePrice(product);
  const count = Number(unit?.units_count) || 1;
  const discount = Number(unit?.discount_percent) || 0;
  return round2(base * count * (1 - discount / 100));
}

/**
 * Undiscounted "list" price of a packaging unit: base price (NO offer) times
 * units_count. Used for the struck-through original price in the UI.
 *
 * @param {object} product
 * @param {object} unit
 * @returns {number}
 */
function unitListPrice(product, unit) {
  const count = Number(unit?.units_count) || 1;
  return round2(Number(product.price) * count);
}

module.exports = {
  effectivePrice,
  unitEffectivePrice,
  unitListPrice,
  round2,
};
