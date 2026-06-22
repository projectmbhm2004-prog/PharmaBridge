// delivery-settlement money math, extracted verbatim from driver.controller.js so
// the controller and the tests exercise the SAME code. pure: no DB, no req/res.
// the controller still owns the surrounding transaction, stock writes and locking;
// only the arithmetic lives here.

// value to knock off the order total for one rejected line: packages rejected × unit price.
// mirrors: deduction += qtyRejected * Number(orderItem.unit_price)
function lineDeduction(quantityRejected, unitPrice) {
  return quantityRejected * Number(unitPrice);
}

// order total once rejected items come off, floored at 0 so rejections can't go negative.
// mirrors: Math.max(0, Number(order.total_amount) - deduction)
function netAfterRejections(orderTotal, deduction) {
  return Math.max(0, Number(orderTotal) - deduction);
}

// what the pharmacy actually owes this company = remaining order total + their prior debt.
// mirrors: const totalDue = newTotal + prevDebt
function totalDue(newTotal, prevDebt) {
  return newTotal + prevDebt;
}

// cash recorded as collected: never more than what's owed, and never negative when the
// pharmacy is already in credit (totalDue <= 0).
// mirrors: totalDue <= 0 ? 0 : Math.min(paidAmount, totalDue)
function cappedPaid(paidAmount, due) {
  return due <= 0 ? 0 : Math.min(paidAmount, due);
}

module.exports = {
  lineDeduction,
  netAfterRejections,
  totalDue,
  cappedPaid,
};
