import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/franchises
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const franchises = await prisma.franchise.findMany({
      include: { _count: { select: { users: true, tickets: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(franchises);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener franquicias' });
  }
});

// POST /api/franchises
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, location, status } = req.body;
    if (!name?.trim() || !location?.trim()) {
      res.status(400).json({ error: 'Nombre y ubicación requeridos' });
      return;
    }
    const franchise = await prisma.franchise.create({
      data: { name, location, status: status || 'Operativa' },
    });
    res.status(201).json(franchise);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear franquicia' });
  }
});

// PATCH /api/franchises/:id
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, location, score, status, active } = req.body;
    const franchise = await prisma.franchise.update({
      where: { id: req.params.id },
      data: { name, location, score, status, active },
    });
    res.json(franchise);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar franquicia' });
  }
});

export default router;
