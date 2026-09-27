const express = require('express');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const salesOrderInclude = {
  quotation: { include: { enquiry: { include: { customer: true } } } },
  items: {
    include: { product: { select: { code: true, name: true, unit: true } } },
  },
};

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const salesOrders = await prisma.salesOrder.findMany({
      orderBy: { id: 'desc' },
      include: salesOrderInclude,
    });
    res.json(salesOrders);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id: Number(req.params.id) },
      include: salesOrderInclude,
    });
    if (!salesOrder) {
      return next(new AppError(404, 'Sales order not found'));
    }
    res.json(salesOrder);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/confirm', authorize('ADMIN'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);

    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      return next(new AppError(404, 'Sales order not found'));
    }

    const items = [...order.items].sort((a, b) => a.productId - b.productId);

    await prisma.$transaction(async (tx) => {
      const statusResult = await tx.salesOrder.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      if (statusResult.count === 0) {
        throw new AppError(409, 'Order is no longer PENDING');
      }

      for (const item of items) {
        const affected = await tx.$executeRaw`
          UPDATE inventory
          SET reserved_qty = reserved_qty + ${item.quantity}
          WHERE product_id = ${item.productId}
            AND physical_qty - reserved_qty >= ${item.quantity}
        `;
        if (affected !== 1) {
          throw new AppError(400, `Insufficient stock for product ${item.productId}`);
        }
      }
    });

    const updated = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: salesOrderInclude,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
