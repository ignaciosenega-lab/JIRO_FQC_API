import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Proxy a OpenAI chat completions. La API key vive solo en el server (nunca
// se expone al navegador). El body se pasa tal cual — el frontend arma el
// payload completo (modelo, mensajes, response_format, etc.).
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

export default router;
