const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');
const customersRoutes = require('./routes/customers.routes');
const productsRoutes = require('./routes/products.routes');
const enquiriesRoutes = require('./routes/enquiries.routes');
const quotationsRoutes = require('./routes/quotations.routes');

// The app is built here but not started, so tests can import it with supertest.
const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/enquiries', enquiriesRoutes);
app.use('/api/quotations', quotationsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
