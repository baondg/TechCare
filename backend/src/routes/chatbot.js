const express = require('express');
const router = express.Router();

// POST /api/chatbot
router.post('/', async (req, res) => {
  const { message, systemPrompt } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }

  // Lấy API key từ header (x-api-key)
  const apiKey = req.header('x-api-key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Chuẩn bị body đúng chuẩn OpenRouter
  const openRouterBody = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: message }
    ]
  };

  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(openRouterBody)
    });
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return res.status(500).json({ error: 'Custom AI API error', detail: errorText });
    }
    const data = await aiResponse.json();
    // OpenRouter trả về { choices: [{ message: { content: ... } }] }
    return res.json({ reply: data.choices?.[0]?.message?.content || data.reply || data.message || 'No response from AI' });
  } catch (err) {
    console.error('Custom AI API call failed:', err);
    return res.status(500).json({ error: 'Failed to call custom AI API', detail: err.message });
  }
});

module.exports = router;
