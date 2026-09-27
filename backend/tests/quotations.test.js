const request = require('supertest');
const app = require('../src/app');
const { resetAndSeed, login } = require('./helpers');
const prisma = require('../src/db');

async function createQuotation(token, quantity = 5) {
  const enquiryRes = await request(app)
    .post('/api/enquiries')
    .set('Authorization', `Bearer ${token}`)
    .send({ customerId: 1, items: [{ productId: 1, quantity }] });

  const quotationRes = await request(app)
    .post('/api/quotations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      enquiryId: enquiryRes.body.id,
      validUntil: '2026-12-31',
      items: [{ productId: 1, quantity, unitPrice: 2450, discountPct: 0, gstPct: 18 }],
    });

  return quotationRes.body.id;
}

async function setStatus(token, quotationId, status) {
  await request(app)
    .patch(`/api/quotations/${quotationId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

describe('Quotation -> Sales Order conversion', () => {
  let salesToken;

  beforeEach(async () => {
    await resetAndSeed();
    salesToken = await login(app, request, 'sales@fundsweb.com', 'Sales@123');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects converting a DRAFT quotation', async () => {
    const quotationId = await createQuotation(salesToken);

    const res = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(400);
  });

  it('rejects converting a REJECTED quotation', async () => {
    const quotationId = await createQuotation(salesToken);
    await setStatus(salesToken, quotationId, 'SENT');
    await setStatus(salesToken, quotationId, 'REJECTED');

    const res = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(400);
  });

  it('converts an ACCEPTED quotation into a Sales Order, and rejects a second conversion of the same quotation', async () => {
    const quotationId = await createQuotation(salesToken);
    await setStatus(salesToken, quotationId, 'SENT');
    await setStatus(salesToken, quotationId, 'ACCEPTED');

    const first = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(first.status).toBe(201);
    expect(first.body.quotationId).toBe(quotationId);

    const second = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(second.status).not.toBe(201);
  });
});
