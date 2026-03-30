import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/visits
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    if (req.userRole === 'FRANCHISE') where.createdById = req.userId;

    const visits = await prisma.visitRequest.findMany({
      where,
      include: { franchise: true, createdBy: { omit: { password: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener visitas' });
  }
});

// POST /api/visits
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { motivo, detalle, urgency, franchiseId } = req.body;
    if (!motivo?.trim() || !detalle?.trim() || !franchiseId) {
      res.status(400).json({ error: 'Motivo, detalle y franquicia requeridos' });
      return;
    }
    const visit = await prisma.visitRequest.create({
      data: { motivo, detalle, urgency: urgency || 'media', franchiseId, createdById: req.userId! },
      include: { franchise: true },
    });
    res.status(201).json(visit);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear visita' });
  }
});

// PATCH /api/visits/:id
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, scheduledDate, assignedTo, internalNotes } = req.body;
    const visit = await prisma.visitRequest.update({
      where: { id: req.params.id },
      data: { status, scheduledDate, assignedTo, internalNotes },
    });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar visita' });
  }
});

export default router;
