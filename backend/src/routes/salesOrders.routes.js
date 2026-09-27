const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const dispatchSchema = z.object({
  vehicleNumber: z.string().min(1),
  driverName: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

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

router.post('/:id/dispatch', authorize('ADMIN'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const data = dispatchSchema.parse(req.body);

    const productIds = data.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      return next(new AppError(400, 'Duplicate product in dispatch items'));
    }

    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      return next(new AppError(404, 'Sales order not found'));
    }
    if (order.status !== 'CONFIRMED') {
      return next(new AppError(400, `Only a CONFIRMED order can be dispatched (current status: ${order.status})`));
    }

    const requestedItems = data.items
      .map((reqItem) => {
        const orderItem = order.items.find((oi) => oi.productId === reqItem.productId);
        return orderItem ? { ...reqItem, salesOrderItemId: orderItem.id } : null;
      })
      .sort((a, b) => a.salesOrderItemId - b.salesOrderItemId);

    if (requestedItems.some((item) => item === null)) {
      return next(new AppError(400, 'One or more products are not part of this order'));
    }

    const dispatch = await prisma.$transaction(async (tx) => {
      for (const item of requestedItems) {
        const itemResult = await tx.$executeRaw`
          UPDATE sales_order_items
          SET dispatched_qty = dispatched_qty + ${item.quantity}
          WHERE id = ${item.salesOrderItemId}
            AND dispatched_qty + ${item.quantity} <= quantity
        `;
        if (itemResult !== 1) {
          throw new AppError(400, `Dispatch quantity exceeds remaining order quantity for product ${item.productId}`);
        }

        const invResult = await tx.$executeRaw`
          UPDATE inventory
          SET physical_qty = physical_qty - ${item.quantity},
              reserved_qty = reserved_qty - ${item.quantity}
          WHERE product_id = ${item.productId}
            AND reserved_qty >= ${item.quantity}
        `;
        if (invResult !== 1) {
          throw new AppError(400, `Inventory reservation mismatch for product ${item.productId}`);
        }
      }

      const [{ next: nextId }] = await tx.$queryRaw`SELECT nextval('dispatches_id_seq') AS next`;
      const id = Number(nextId);
      const dispatchNumber = `DSP-${String(id).padStart(5, '0')}`;

      const created = await tx.dispatch.create({
        data: {
          id,
          dispatchNumber,
          salesOrderId: orderId,
          vehicleNumber: data.vehicleNumber,
          driverName: data.driverName,
          createdById: req.user.id,
          items: {
            create: requestedItems.map((item) => ({
              salesOrderItemId: item.salesOrderItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: {
            include: { salesOrderItem: { include: { product: { select: { code: true, name: true, unit: true } } } } },
          },
        },
      });

      const freshItems = await tx.salesOrderItem.findMany({ where: { salesOrderId: orderId } });
      const fullyDispatched = freshItems.every((oi) => oi.dispatchedQty === oi.quantity);
      if (fullyDispatched) {
        await tx.salesOrder.update({ where: { id: orderId }, data: { status: 'DISPATCHED' } });
      }

      return created;
    });

    const updatedOrder = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: salesOrderInclude,
    });

    res.status(201).json({ dispatch, salesOrder: updatedOrder });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', authorize('SALES'), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);

    const result = await prisma.salesOrder.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    if (result.count === 0) {
      const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
      if (!order) {
        return next(new AppError(404, 'Sales order not found'));
      }
      return next(new AppError(400, `Only a PENDING order can be cancelled (current status: ${order.status})`));
    }

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
