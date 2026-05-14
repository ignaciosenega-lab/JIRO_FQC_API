import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const requireEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

// Fetch HTML from a public URL — sortea CORS para el frontend
router.post('/menu-fetch', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL requerida' });
      return;
    }
    // Validación básica: solo http/https
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: 'URL inválida' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Solo se permiten URLs http/https' });
      return;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JIRO-MenuReview/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `El sitio respondió con status ${response.status}`, status: response.status });
      return;
    }

    const html = await response.text();
    // Extraer solo el contenido textual visible (sin scripts, styles, ni tags HTML)
    const cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Detección heurística: si el cleaned tiene muy poco texto, probablemente es un SPA
    const looksLikeSpa = cleaned.length < 500;

    // Si es SPA, intentamos el fallback automático: ${origin}/api/menu
    if (looksLikeSpa) {
      const apiCandidates = [`${parsed.origin}/api/menu`, `${parsed.origin}/api/products`];
      for (const apiUrl of apiCandidates) {
        try {
          const apiResp = await fetch(apiUrl, {
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; JIRO-MenuReview/1.0)' },
            signal: AbortSignal.timeout(10000),
          });
          if (!apiResp.ok) continue;
          const ct = apiResp.headers.get('content-type') || '';
          if (!ct.includes('application/json')) continue;
          const json = await apiResp.json();
          const jsonText = JSON.stringify(json, null, 2);
          res.json({
            ok: true,
            url,
            text: jsonText.slice(0, 50000),
            length: jsonText.length,
            looksLikeSpa: false,
            source: 'api',
            apiUrl,
          });
          return;
        } catch { /* try next candidate */ }
      }
    }

    res.json({
      ok: true,
      url,
      text: cleaned.slice(0, 50000),
      length: cleaned.length,
      looksLikeSpa,
      source: 'html',
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      res.status(504).json({ error: 'La URL tardó demasiado en responder' });
      return;
    }
    res.status(500).json({ error: e?.message || 'Error fetcheando la URL' });
  }
});

export default router;
