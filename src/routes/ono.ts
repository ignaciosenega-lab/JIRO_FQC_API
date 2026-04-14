import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const requireOnoEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => {
      const uniqueName = `ono-${Date.now()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
});

const router = Router();

// GET /api/ono/config
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  try {
    let config = await prisma.onoConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.onoConfig.create({ data: { id: 'singleton', customPrompt: '' } });
    }
    const files = await prisma.contextFile.findMany({ orderBy: { uploadedAt: 'desc' } });
    // Parse JSON fields
    const parsed = {
      ...config,
      quickCategories: JSON.parse(config.quickCategories || '[]'),
      manualTopics: JSON.parse(config.manualTopics || '[]'),
      suggestedQueries: JSON.parse(config.suggestedQueries || '[]'),
      temperatureRef: JSON.parse(config.temperatureRef || '[]'),
    };
    res.json({ config: parsed, files });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PATCH /api/ono/config
router.patch('/config', authenticate, requireOnoEditor, async (req: Request, res: Response) => {
  try {
    const { customPrompt, quickCategories, manualTopics, suggestedQueries, temperatureRef } = req.body;
    const data: any = {};
    if (customPrompt !== undefined) data.customPrompt = customPrompt;
    if (quickCategories !== undefined) data.quickCategories = JSON.stringify(quickCategories);
    if (manualTopics !== undefined) data.manualTopics = JSON.stringify(manualTopics);
    if (suggestedQueries !== undefined) data.suggestedQueries = JSON.stringify(suggestedQueries);
    if (temperatureRef !== undefined) data.temperatureRef = JSON.stringify(temperatureRef);

    const config = await prisma.onoConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// POST /api/ono/context-files
router.post('/context-files', authenticate, requireOnoEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { extractedText } = req.body;
    if (!req.file) {
      res.status(400).json({ error: 'Archivo requerido' });
      return;
    }
    const file = await prisma.contextFile.create({
      data: {
        fileName: req.file.originalname,
        size: `${(req.file.size / 1024).toFixed(1)} KB`,
        extractedText: extractedText || '',
      },
    });

    // Auto-suggest sidebar items from extracted text
    let suggestions = null;
    if (extractedText && process.env.OPENAI_API_KEY) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `Analizá este documento de operaciones de un restaurante de sushi y extraé datos estructurados. Devolvé JSON con:
- "manualTopics": array de {title, desc} - hasta 6 temas clave encontrados
- "suggestedQueries": array de {text, category} - hasta 6 preguntas prácticas que el personal podría hacer
- "temperatureRef": array de {label, value, color} - referencias de temperatura encontradas (color: text-orange-400, text-cyan-400, text-blue-400, text-amber-400, text-red-400)
Solo incluí items claramente respaldados por el documento. Respondé en español rioplatense.` },
              { role: 'user', content: extractedText.slice(0, 8000) }
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          suggestions = JSON.parse(data.choices[0].message.content);
        }
      } catch {}
    }

    res.status(201).json({ ...file, suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// DELETE /api/ono/context-files/:id
router.delete('/context-files/:id', authenticate, requireOnoEditor, async (req: Request, res: Response) => {
  try {
    await prisma.contextFile.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

export default router;
