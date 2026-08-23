const express = require('express');
const SandboxController = require('../controllers/sandboxController');
const { validateAnalyzeRequest } = require('../middleware/requestValidator');

const router = express.Router();

// Health check endpoint
router.get('/health', SandboxController.health);

// Sandbox execution and eBPF security analysis endpoint
router.post('/analyze', validateAnalyzeRequest, SandboxController.analyze);

module.exports = router;
