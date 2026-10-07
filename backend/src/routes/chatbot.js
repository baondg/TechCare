const express = require('express');
const logger = require('../common/logger');
const { config } = require('../config/env');
const router = express.Router();

// POST /api/chatbot — OpenRouter proxy using server-side OPENROUTER_API_KEY only
router.post('/', async (req, res) => {
  const { message, systemPrompt } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }

  const apiKey = config.ai.openRouterApiKey;
  if (!apiKey) {
    return res.status(503).json({
      error: 'OpenRouter is not configured',
      hint: 'Set OPENROUTER_API_KEY in the backend environment (do not send API keys from clients).',
    });
  }

  const openRouterBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: message },
    ],
  };

  try {
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(openRouterBody),
    });
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return res.status(500).json({ error: 'OpenRouter API error', detail: errorText });
    }
    const data = await aiResponse.json();
    return res.json({
      reply: data.choices?.[0]?.message?.content || data.reply || data.message || 'No response from AI',
    });
  } catch (err) {
    logger.error({ err }, 'OpenRouter call failed');
    return res.status(500).json({ error: 'Failed to call OpenRouter', detail: err.message });
  }
});

module.exports = router;
