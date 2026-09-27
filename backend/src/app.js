const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');

// The app is built here but not started, so tests can import it with supertest.
const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
