import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const router = Router();

// GET /api/manual-items?categoryId=xxx&search=xxx
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { categoryId, search } = req.query;
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.manualItem.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener items' });
  }
});

// POST /api/manual-items
router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, type, categoryId, textContent, author } = req.body;
    if (!title?.trim() || !categoryId) {
      res.status(400).json({ error: 'Título y categoría requeridos' });
      return;
    }

    const data: any = {
      title: title.trim(),
      description: description || '',
      type: type || 'TEXT',
      categoryId,
      author: author || 'Admin',
      textContent,
    };

    if (req.file) {
      data.fileName = req.file.originalname;
      data.fileUrl = `/uploads/${req.file.filename}`;
    }

    const item = await prisma.manualItem.create({ data, include: { category: true } });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear item' });
  }
});

// POST /api/manual-items/bulk - for AI import
router.post('/bulk', authenticate, async (req: Request, res: Response) => {
  try {
    const { items } = req.body; // [{ title, description, categoryId, textContent, author }]
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Se requiere un array de items' });
      return;
    }

    const created = await prisma.$transaction(
      items.map((item: any) =>
        prisma.manualItem.create({
          data: {
            title: item.title,
            description: item.description || '',
            type: 'TEXT',
            categoryId: item.categoryId,
            textContent: item.textContent || '',
            author: item.author || 'ChatGPT (importado)',
          },
          include: { category: true },
        })
      )
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Error al importar items' });
  }
});

// DELETE /api/manual-items/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.manualItem.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar item' });
  }
});

export default router;
