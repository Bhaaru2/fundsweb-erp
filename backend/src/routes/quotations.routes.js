const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');
const { calculateQuotation } = require('../utils/quotationCalc');

const router = express.Router();

const createQuotationSchema = z.object({
  enquiryId: z.number().int().positive(),
  validUntil: z.coerce.date(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        discountPct: z.number().min(0).max(100),
        gstPct: z.number().min(0).max(100),
      })
    )
    .min(1),
});

const statusUpdateSchema = z.object({
  status: z.enum(['SENT', 'ACCEPTED', 'REJECTED']),
});

const allowedTransitions = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED'],
};

const quotationInclude = {
  enquiry: { include: { customer: true } },
  items: {
    include: { product: { select: { code: true, name: true, unit: true } } },
  },
};

const salesOrderInclude = {
  quotation: { include: { enquiry: { include: { customer: true } } } },
  items: {
    include: { product: { select: { code: true, name: true, unit: true } } },
  },
};

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const quotations = await prisma.quotation.findMany({
      orderBy: { id: 'desc' },
      include: quotationInclude,
    });
    res.json(quotations);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: Number(req.params.id) },
      include: quotationInclude,
    });
    if (!quotation) {
      return next(new AppError(404, 'Quotation not found'));
    }
    res.json(quotation);
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('SALES'), async (req, res, next) => {
  try {
    const data = createQuotationSchema.parse(req.body);

    const enquiry = await prisma.enquiry.findUnique({ where: { id: data.enquiryId } });
    if (!enquiry) {
      return next(new AppError(404, 'Enquiry not found'));
    }
    if (enquiry.status === 'WON' || enquiry.status === 'LOST') {
      return next(new AppError(400, `Cannot create a quotation for a ${enquiry.status} enquiry`));
    }

    const productIds = data.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      return next(new AppError(400, 'Duplicate product in quotation items'));
    }

    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      return next(new AppError(400, 'One or more products do not exist'));
    }

    const { lines, grandTotal } = calculateQuotation(data.items);

    const quotation = await prisma.$transaction(async (tx) => {
      const [{ next: nextId }] = await tx.$queryRaw`SELECT nextval('quotations_id_seq') AS next`;
      const id = Number(nextId);
      const quotationNumber = `QT-${String(id).padStart(5, '0')}`;

      if (enquiry.status === 'NEW') {
        await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: 'QUOTED' } });
      }

      const created = await tx.quotation.create({
        data: {
          id,
          quotationNumber,
          enquiryId: enquiry.id,
          validUntil: data.validUntil,
          grandTotal,
          createdById: req.user.id,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountPct: line.discountPct,
              gstPct: line.gstPct,
              baseAmount: line.baseAmount,
              discountAmount: line.discountAmount,
              gstAmount: line.gstAmount,
              lineAmount: line.lineAmount,
            })),
          },
        },
        include: quotationInclude,
      });

      return created;
    });

    res.status(201).json(quotation);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authorize('SALES'), async (req, res, next) => {
  try {
    const { status } = statusUpdateSchema.parse(req.body);
    const quotationId = Number(req.params.id);

    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) {
      return next(new AppError(404, 'Quotation not found'));
    }

    const allowed = allowedTransitions[quotation.status] || [];
    if (!allowed.includes(status)) {
      return next(new AppError(400, `Invalid status transition from ${quotation.status} to ${status}`));
    }

    const updated = await prisma.quotation.update({
      where: { id: quotationId },
      data: { status },
      include: quotationInclude,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/convert', authorize('SALES'), async (req, res, next) => {
  try {
    const quotationId = Number(req.params.id);

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: true, enquiry: true },
    });
    if (!quotation) {
      return next(new AppError(404, 'Quotation not found'));
    }
    if (quotation.status !== 'ACCEPTED') {
      return next(
        new AppError(400, `Only an ACCEPTED quotation can be converted (current status: ${quotation.status})`)
      );
    }
    if (quotation.enquiry.status !== 'QUOTED') {
      return next(
        new AppError(
          400,
          `Enquiry must be QUOTED to convert this quotation (current status: ${quotation.enquiry.status})`
        )
      );
    }

    const existingOrder = await prisma.salesOrder.findUnique({ where: { quotationId } });
    if (existingOrder) {
      return next(new AppError(409, 'A Sales Order already exists for this quotation'));
    }

    const salesOrder = await prisma.$transaction(async (tx) => {
      const [{ next: nextId }] = await tx.$queryRaw`SELECT nextval('sales_orders_id_seq') AS next`;
      const id = Number(nextId);
      const orderNumber = `SO-${String(id).padStart(5, '0')}`;

      await tx.enquiry.update({ where: { id: quotation.enquiryId }, data: { status: 'WON' } });

      const created = await tx.salesOrder.create({
        data: {
          id,
          orderNumber,
          quotationId,
          totalAmount: quotation.grandTotal,
          createdById: req.user.id,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineAmount: item.lineAmount,
            })),
          },
        },
        include: salesOrderInclude,
      });

      return created;
    });

    res.status(201).json(salesOrder);
  } catch (err) {
    if (err.code === 'P2002') {
      return next(new AppError(409, 'A Sales Order already exists for this quotation'));
    }
    next(err);
  }
});

module.exports = router;
