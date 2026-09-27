const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const users = [
  { name: 'Admin User', email: 'admin@fundsweb.com', password: 'Admin@123', role: 'ADMIN' },
  { name: 'Sales User', email: 'sales@fundsweb.com', password: 'Sales@123', role: 'SALES' },
];

const customers = [
  { companyName: 'ABC Engineering Pvt. Ltd.', contactPerson: 'Rajesh Kulkarni', mobile: '9822012345', email: 'rajesh@abceng.in', city: 'Pune' },
  { companyName: 'Shree Fabricators', contactPerson: 'Anita Deshmukh', mobile: '9890123456', email: 'anita@shreefab.in', city: 'Nashik' },
  { companyName: 'Deccan Auto Components', contactPerson: 'Vikram Patil', mobile: '9765012345', email: 'vikram@deccanauto.in', city: 'Chakan' },
];

const products = [
  { code: 'BRG-6205', name: 'Ball Bearing 6205', category: 'Bearings', unit: 'pcs', basePrice: 185, physical: 500 },
  { code: 'VLV-GT-2', name: 'Gate Valve 2 inch', category: 'Valves', unit: 'pcs', basePrice: 2450, physical: 100 },
  { code: 'MTR-5HP', name: '5 HP Induction Motor', category: 'Motors', unit: 'nos', basePrice: 18500, physical: 20 },
  { code: 'HOS-HYD-05', name: 'Hydraulic Hose 1/2 inch', category: 'Hoses', unit: 'm', basePrice: 320, physical: 1000 },
  { code: 'BLT-M12', name: 'MS Hex Bolt M12 (box of 100)', category: 'Fasteners', unit: 'box', basePrice: 950, physical: 200 },
  { code: 'VBT-B52', name: 'V-Belt B-52', category: 'Power Transmission', unit: 'pcs', basePrice: 410, physical: 300 },
];

async function main() {
  await prisma.dispatchItem.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.enquiryItem.deleteMany();
  await prisma.enquiry.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  for (const u of users) {
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        role: u.role,
      },
    });
  }

  await prisma.customer.createMany({ data: customers });

  for (const p of products) {
    await prisma.product.create({
      data: {
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        basePrice: p.basePrice,
        inventory: { create: { physicalQty: p.physical, reservedQty: 0 } },
      },
    });
  }

  console.log(`Seeded ${users.length} users, ${customers.length} customers, ${products.length} products with inventory.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
