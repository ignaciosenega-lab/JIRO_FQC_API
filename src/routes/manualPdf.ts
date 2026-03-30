import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma';
import { authenticate, requireAdmin } from '../middleware/auth';

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => {
      const uniqueName = `manual-${Date.now()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
});

const router = Router();

// GET /api/manual-pdf
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const pdf = await prisma.manualPdf.findFirst({ where: { active: true }, orderBy: { uploadedAt: 'desc' } });
    res.json(pdf);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener PDF' });
  }
});

// POST /api/manual-pdf
router.post('/', authenticate, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Archivo PDF requerido' });
      return;
    }
    // Deactivate previous
    await prisma.manualPdf.updateMany({ where: { active: true }, data: { active: false } });
    const pdf = await prisma.manualPdf.create({
      data: {
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        size: `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`,
      },
    });
    res.status(201).json(pdf);
  } catch (err) {
    res.status(500).json({ error: 'Error al subir PDF' });
  }
});

// DELETE /api/manual-pdf/:id
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.manualPdf.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar PDF' });
  }
});

export default router;
