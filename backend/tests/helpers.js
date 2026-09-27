const bcrypt = require('bcrypt');
const prisma = require('../src/db');

if (!process.env.DATABASE_URL.includes('fundsweb_erp_test')) {
  throw new Error('Refusing to run tests: DATABASE_URL does not point at the test database');
}

let passwordHashes = null;

async function getPasswordHashes() {
  if (!passwordHashes) {
    passwordHashes = {
      admin: await bcrypt.hash('Admin@123', 10),
      sales: await bcrypt.hash('Sales@123', 10),
    };
  }
  return passwordHashes;
}

async function resetAndSeed() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      dispatch_items, dispatches,
      sales_order_items, sales_orders,
      quotation_items, quotations,
      enquiry_items, enquiries,
      inventory, products,
      customers, users
    RESTART IDENTITY CASCADE
  `);

  const hashes = await getPasswordHashes();

  await prisma.user.createMany({
    data: [
      { name: 'Admin User', email: 'admin@fundsweb.com', passwordHash: hashes.admin, role: 'ADMIN' },
      { name: 'Sales User', email: 'sales@fundsweb.com', passwordHash: hashes.sales, role: 'SALES' },
    ],
  });

  await prisma.customer.create({
    data: {
      companyName: 'ABC Engineering Pvt. Ltd.',
      contactPerson: 'Rajesh Kulkarni',
      mobile: '9822012345',
      email: 'rajesh@abceng.in',
      city: 'Pune',
    },
  });

  await prisma.product.create({
    data: {
      code: 'VLV-GT-2',
      name: 'Gate Valve 2 inch',
      category: 'Valves',
      unit: 'pcs',
      basePrice: 2450,
      inventory: { create: { physicalQty: 100, reservedQty: 0 } },
    },
  });

  await prisma.product.create({
    data: {
      code: 'MTR-5HP',
      name: '5 HP Induction Motor',
      category: 'Motors',
      unit: 'nos',
      basePrice: 18500,
      inventory: { create: { physicalQty: 20, reservedQty: 0 } },
    },
  });
}

async function login(app, request, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

module.exports = { resetAndSeed, login, prisma };
