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

// GET /api/franchises/stats
router.get('/stats', authenticate, async (_req: Request, res: Response) => {
  try {
    const total = await prisma.franchise.count({ where: { active: true } });
    const activas = await prisma.franchise.count({ where: { status: 'activa', active: true } });
    const franchises = await prisma.franchise.findMany({ where: { active: true }, select: { employees: true, lastAuditScore: true } });
    const totalEmployees = franchises.reduce((sum, f) => sum + f.employees, 0);
    const scores = franchises.filter(f => f.lastAuditScore != null).map(f => f.lastAuditScore!);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const openTickets = await prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } });
    res.json({ total, activas, totalEmployees, avgScore, openTickets });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/franchises
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.name?.trim()) {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }
    const franchise = await prisma.franchise.create({ data });
    res.status(201).json(franchise);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear franquicia' });
  }
});

// PATCH /api/franchises/:id
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const franchise = await prisma.franchise.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(franchise);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar franquicia' });
  }
});

// DELETE /api/franchises/:id
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.franchise.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar franquicia' });
  }
});

export default router;
