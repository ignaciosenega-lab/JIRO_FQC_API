import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

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
    res.json({ config, files });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PATCH /api/ono/config
router.patch('/config', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { customPrompt } = req.body;
    const config = await prisma.onoConfig.upsert({
      where: { id: 'singleton' },
      update: { customPrompt },
      create: { id: 'singleton', customPrompt },
    });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// POST /api/ono/context-files
router.post('/context-files', authenticate, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
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
    res.status(201).json(file);
  } catch (err) {
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// DELETE /api/ono/context-files/:id
router.delete('/context-files/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.contextFile.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

export default router;
