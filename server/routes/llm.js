const express = require('express');
const auth = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();

router.get('/models', auth, async (req, res) => {
  // Log that the endpoint was hit
  console.log('=== /api/llm/models endpoint called ===');
  console.log('Request headers:', req.headers);
  console.log('User:', req.user);
  
  try {
    console.log('Calling llmService.listModels()...');
    const models = await llmService.listModels();
    console.log(`Returning ${models.length} models`);
    res.json({ data: models });
  } catch (error) {
    console.error('Error listing models:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

module.exports = router;
