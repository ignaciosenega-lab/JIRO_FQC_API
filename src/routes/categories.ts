import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const requireOpsEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const router = Router();

// GET /api/categories
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// POST /api/categories
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { title, description, icon, color, bg } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: 'Título requerido' });
      return;
    }
    const category = await prisma.category.create({
      data: { title: title.trim(), description: description || '', icon, color, bg },
    });
    res.status(201).json(category);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe una categoría con ese título' });
      return;
    }
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authenticate, requireOpsEditor, async (req: Request, res: Response) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

export default router;
