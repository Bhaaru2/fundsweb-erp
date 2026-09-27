const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new AppError(401, 'Missing authentication token'));
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (err) {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'Forbidden: insufficient role'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
