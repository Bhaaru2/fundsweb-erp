const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const updateInventorySchema = z.object({
  physicalQty: z.number().int().nonnegative(),
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { inventory: true },
      orderBy: { id: 'asc' },
    });

    const result = products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      basePrice: p.basePrice,
      physicalQty: p.inventory?.physicalQty ?? 0,
      reservedQty: p.inventory?.reservedQty ?? 0,
      available: (p.inventory?.physicalQty ?? 0) - (p.inventory?.reservedQty ?? 0),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/inventory', authorize('ADMIN'), async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { physicalQty } = updateInventorySchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { inventory: true },
    });

    if (!product || !product.inventory) {
      return next(new AppError(404, 'Product not found'));
    }

    if (physicalQty < product.inventory.reservedQty) {
      return next(
        new AppError(
          400,
          `physicalQty cannot be less than the reserved quantity (${product.inventory.reservedQty})`
        )
      );
    }

    const inventory = await prisma.inventory.update({
      where: { productId },
      data: { physicalQty },
    });

    res.json({
      id: product.id,
      code: product.code,
      physicalQty: inventory.physicalQty,
      reservedQty: inventory.reservedQty,
      available: inventory.physicalQty - inventory.reservedQty,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
