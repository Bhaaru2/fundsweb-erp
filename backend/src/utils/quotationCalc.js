const { Prisma } = require('@prisma/client');

function calculateLine({ quantity, unitPrice, discountPct, gstPct }) {
  const baseAmount = new Prisma.Decimal(quantity).mul(unitPrice).toDecimalPlaces(2);
  const discountAmount = baseAmount.mul(discountPct).div(100).toDecimalPlaces(2);
  const taxableAmount = baseAmount.sub(discountAmount);
  const gstAmount = taxableAmount.mul(gstPct).div(100).toDecimalPlaces(2);
  const lineAmount = taxableAmount.add(gstAmount).toDecimalPlaces(2);

  return { baseAmount, discountAmount, gstAmount, lineAmount };
}

function calculateQuotation(items) {
  const lines = items.map((item) => ({ ...item, ...calculateLine(item) }));
  const grandTotal = lines
    .reduce((sum, line) => sum.add(line.lineAmount), new Prisma.Decimal(0))
    .toDecimalPlaces(2);

  return { lines, grandTotal };
}

module.exports = { calculateLine, calculateQuotation };
