import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Proxy a OpenAI chat completions. La API key vive solo en el server.
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el server' });
      return;
    }
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Error consultando OpenAI' });
  }
});

// Proxy a OpenAI Responses API (soporta el tool web_search nativo).
// Body: { model, input | messages, tools?, temperature?, ... }
router.post('/responses', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el server' });
      return;
    }
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Error consultando OpenAI Responses' });
  }
});

// Proxy a Anthropic Messages API (Claude). Soporta el tool web_search_20250305.
// Body: { model, messages, system?, max_tokens, tools?, ... }
router.post('/anthropic', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en el server' });
      return;
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Error consultando Anthropic' });
  }
});

export default router;
