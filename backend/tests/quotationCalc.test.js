const { calculateQuotation } = require('../src/utils/quotationCalc');

describe('calculateQuotation', () => {
  it('computes base, discount, GST and line amounts correctly for each line, and sums the grand total', () => {
    const { lines, grandTotal } = calculateQuotation([
      { productId: 1, quantity: 10, unitPrice: 100, discountPct: 10, gstPct: 18 },
      { productId: 2, quantity: 5, unitPrice: 2450, discountPct: 0, gstPct: 18 },
    ]);

    expect(lines[0].baseAmount.toString()).toBe('1000');
    expect(lines[0].discountAmount.toString()).toBe('100');
    expect(lines[0].gstAmount.toString()).toBe('162');
    expect(lines[0].lineAmount.toString()).toBe('1062');

    expect(lines[1].baseAmount.toString()).toBe('12250');
    expect(lines[1].discountAmount.toString()).toBe('0');
    expect(lines[1].gstAmount.toString()).toBe('2205');
    expect(lines[1].lineAmount.toString()).toBe('14455');

    expect(grandTotal.toString()).toBe('15517');
  });
});
