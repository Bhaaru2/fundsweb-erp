const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const createEnquirySchema = z.object({
  customerId: z.number().int().positive(),
  enquiryDate: z.coerce.date().optional(),
  requiredDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

const statusUpdateSchema = z.object({
  status: z.enum(['QUOTED', 'WON', 'LOST']),
});

const allowedTransitions = {
  NEW: ['QUOTED'],
  QUOTED: ['WON', 'LOST'],
};

const enquiryInclude = {
  customer: true,
  items: {
    include: { product: { select: { code: true, name: true, unit: true } } },
  },
};

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const enquiries = await prisma.enquiry.findMany({
      orderBy: { id: 'desc' },
      include: enquiryInclude,
    });
    res.json(enquiries);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: Number(req.params.id) },
      include: enquiryInclude,
    });
    if (!enquiry) {
      return next(new AppError(404, 'Enquiry not found'));
    }
    res.json(enquiry);
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('SALES'), async (req, res, next) => {
  try {
    const data = createEnquirySchema.parse(req.body);

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      return next(new AppError(404, 'Customer not found'));
    }

    const productIds = data.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      return next(new AppError(400, 'Duplicate product in enquiry items'));
    }

    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      return next(new AppError(400, 'One or more products do not exist'));
    }

    const [{ next: nextId }] = await prisma.$queryRaw`SELECT nextval('enquiries_id_seq') AS next`;
    const id = Number(nextId);
    const enquiryNumber = `ENQ-${String(id).padStart(5, '0')}`;

    const enquiry = await prisma.enquiry.create({
      data: {
        id,
        enquiryNumber,
        customerId: data.customerId,
        ...(data.enquiryDate && { enquiryDate: data.enquiryDate }),
        ...(data.requiredDate && { requiredDate: data.requiredDate }),
        notes: data.notes,
        createdById: req.user.id,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: enquiryInclude,
    });

    res.status(201).json(enquiry);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authorize('SALES'), async (req, res, next) => {
  try {
    const { status } = statusUpdateSchema.parse(req.body);
    const enquiryId = Number(req.params.id);

    const enquiry = await prisma.enquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) {
      return next(new AppError(404, 'Enquiry not found'));
    }

    const allowed = allowedTransitions[enquiry.status] || [];
    if (!allowed.includes(status)) {
      return next(new AppError(400, `Invalid status transition from ${enquiry.status} to ${status}`));
    }

    const updated = await prisma.enquiry.update({
      where: { id: enquiryId },
      data: { status },
      include: enquiryInclude,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
