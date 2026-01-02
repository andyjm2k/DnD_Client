const express = require('express');
const auth = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();

router.get('/models', auth, async (req, res) => {
  try {
    const models = await llmService.listModels();
    res.json({ data: models });
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

module.exports = router;
