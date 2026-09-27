const express = require('express');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate } = require('../middleware/auth');

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

module.exports = router;
