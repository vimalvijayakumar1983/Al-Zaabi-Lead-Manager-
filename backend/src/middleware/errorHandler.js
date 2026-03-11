const { logger } = require('../config/logger');

const errorHandler = (err, _req, res, _next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack });

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'A record with this value already exists',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  });
};

const notFoundHandler = (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

module.exports = { errorHandler, notFoundHandler };
