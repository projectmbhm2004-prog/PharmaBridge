// shared price math. keeping it all in one file so cart / checkout / market / detail
// never end up computing prices differently from each other - that bit us once already.

// per-base-unit price: use the offer price while the offer is live, otherwise the base price
function effectivePrice(product) {
  const hasOffer = product.has_offer === 1 || product.has_offer === true;
  const offerValid =
    hasOffer &&
    product.offer_price !== null &&
    product.offer_price !== undefined &&
    (!product.offer_ends_at || new Date(product.offer_ends_at) > new Date());
  return offerValid ? Number(product.offer_price) : Number(product.price);
}

// round to 2dp but hand back a Number, not the string toFixed gives you
function round2(n) {
  return Number(Number(n).toFixed(2));
}

// price for one packaging unit (a product_units row).
// final_price, if set, wins outright - it's a manual override of the whole calc.
// otherwise: base price (offer-aware) * units_count * (1 - discount_percent/100)
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

// the "before" price for the struck-through UI bit: base price with no offer, times units_count
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
