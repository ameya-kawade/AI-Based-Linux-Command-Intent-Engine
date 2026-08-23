const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (skip during automated test runs)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Mount API routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'Tracee eBPF Dynamic Sandbox Executor',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      analyze: 'POST /api/analyze',
    },
  });
});

// 404 and Error handling middlewares
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
