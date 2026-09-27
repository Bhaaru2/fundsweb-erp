const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config/env');
const prisma = require('../db');
const AppError = require('../utils/AppError');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return next(new AppError(401, 'Invalid email or password'));
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return next(new AppError(401, 'Invalid email or password'));
    }

    const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return next(new AppError(401, 'User no longer exists'));
    }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
