const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const createCustomerSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().min(1),
  mobile: z.string().min(1),
  email: z.string().email(),
  city: z.string().min(1),
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { id: 'desc' } });
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('SALES'), async (req, res, next) => {
  try {
    const data = createCustomerSchema.parse(req.body);
    const customer = await prisma.customer.create({ data });
    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
