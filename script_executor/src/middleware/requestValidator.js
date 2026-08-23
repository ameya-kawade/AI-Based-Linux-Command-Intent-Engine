const config = require('../config');

const validateAnalyzeRequest = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid request payload: Request body must be a JSON object.',
    });
  }

  const { script } = req.body;

  if (script === undefined || script === null) {
    return res.status(400).json({
      status: 'error',
      error: 'Missing required field: "script" is required.',
    });
  }

  if (typeof script !== 'string') {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid field type: "script" must be a string.',
    });
  }

  if (script.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid field content: "script" must not be empty.',
    });
  }

  const scriptSizeBytes = Buffer.byteLength(script, 'utf8');
  if (scriptSizeBytes > config.maxScriptSizeBytes) {
    return res.status(413).json({
      status: 'error',
      error: `Script size (${scriptSizeBytes} bytes) exceeds the maximum allowed limit of ${config.maxScriptSizeBytes} bytes.`,
    });
  }

  next();
};

module.exports = {
  validateAnalyzeRequest,
};
