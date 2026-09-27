const request = require('supertest');
const app = require('../src/app');
const { resetAndSeed, login, prisma } = require('./helpers');

async function createOrder(token, productId, quantity, unitPrice) {
  const enquiryRes = await request(app)
    .post('/api/enquiries')
    .set('Authorization', `Bearer ${token}`)
    .send({ customerId: 1, items: [{ productId, quantity }] });

  const quotationRes = await request(app)
    .post('/api/quotations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      enquiryId: enquiryRes.body.id,
      validUntil: '2026-12-31',
      items: [{ productId, quantity, unitPrice, discountPct: 0, gstPct: 18 }],
    });

  await request(app)
    .patch(`/api/quotations/${quotationRes.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'SENT' });
  await request(app)
    .patch(`/api/quotations/${quotationRes.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'ACCEPTED' });

  const orderRes = await request(app)
    .post(`/api/quotations/${quotationRes.body.id}/convert`)
    .set('Authorization', `Bearer ${token}`);

  return orderRes.body.id;
}

describe('Inventory reservation and dispatch', () => {
  let adminToken;
  let salesToken;

  beforeEach(async () => {
    await resetAndSeed();
    adminToken = await login(app, request, 'admin@fundsweb.com', 'Admin@123');
    salesToken = await login(app, request, 'sales@fundsweb.com', 'Sales@123');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('cannot reserve more than available inventory', async () => {
    // MTR-5HP (product 2) has only 20 physical in the test seed.
    const orderId = await createOrder(salesToken, 2, 25, 18500);

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);

    const inventory = await prisma.inventory.findUnique({ where: { productId: 2 } });
    expect(inventory.reservedQty).toBe(0);
  });

  it('rejects a Sales user confirming an order (unauthorized restricted operation)', async () => {
    const orderId = await createOrder(salesToken, 1, 5, 2450);

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(403);
  });

  it('bonus: only one of two simultaneous reservations succeeds when combined demand exceeds availability', async () => {
    // VLV-GT-2 (product 1) has 100 physical. Order A wants 80, Order B wants 50 -> combined 130 > 100.
    const orderA = await createOrder(salesToken, 1, 80, 2450);
    const orderB = await createOrder(salesToken, 1, 50, 2450);

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/sales-orders/${orderA}/confirm`).set('Authorization', `Bearer ${adminToken}`),
      request(app).post(`/api/sales-orders/${orderB}/confirm`).set('Authorization', `Bearer ${adminToken}`),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const inventory = await prisma.inventory.findUnique({ where: { productId: 1 } });
    expect(inventory.physicalQty).toBe(100);
    expect([80, 50]).toContain(inventory.reservedQty);
  });

  it('dispatch concurrency: only one of two simultaneous dispatches succeeds when combined quantity exceeds the order', async () => {
    // Order for 100 units of VLV-GT-2, confirmed (reserved = 100).
    const orderId = await createOrder(salesToken, 1, 100, 2450);
    await request(app).post(`/api/sales-orders/${orderId}/confirm`).set('Authorization', `Bearer ${adminToken}`);

    const dispatchPayload = (qty) => ({
      vehicleNumber: 'MH12AB1234',
      driverName: 'Test Driver',
      items: [{ productId: 1, quantity: qty }],
    });

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/sales-orders/${orderId}/dispatch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dispatchPayload(70)),
      request(app)
        .post(`/api/sales-orders/${orderId}/dispatch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dispatchPayload(50)),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const orderItem = await prisma.salesOrderItem.findFirst({ where: { salesOrderId: orderId } });
    expect(orderItem.quantity).toBe(100);
    expect([70, 50]).toContain(orderItem.dispatchedQty);
    expect(orderItem.dispatchedQty).toBeLessThanOrEqual(orderItem.quantity);
  });
});
