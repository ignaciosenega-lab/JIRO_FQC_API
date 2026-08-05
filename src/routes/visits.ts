import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const requireVisitsEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES', 'FRANQUICIA');

const router = Router();

// GET /api/visits
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    if (req.userRole === 'FRANQUICIA') where.createdById = req.userId;

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
    const { motivo, detalle, urgency, franchiseId, scheduledDate, endDate, assignedTo, status } = req.body;
    if (!motivo?.trim() || !detalle?.trim() || !franchiseId) {
      res.status(400).json({ error: 'Motivo, detalle y franquicia requeridos' });
      return;
    }
    const data: Record<string, unknown> = {
      motivo,
      detalle,
      urgency: urgency || 'media',
      franchiseId,
      createdById: req.userId!,
    };
    if (scheduledDate) data.scheduledDate = new Date(scheduledDate);
    if (endDate) {
      const end = new Date(endDate);
      if (scheduledDate && end < new Date(scheduledDate)) {
        res.status(400).json({ error: 'endDate no puede ser anterior a scheduledDate' });
        return;
      }
      data.endDate = end;
    }
    if (typeof assignedTo === 'string' && assignedTo.trim()) data.assignedTo = assignedTo.trim();
    if (typeof status === 'string' && status.trim()) data.status = status.trim();
    const visit = await prisma.visitRequest.create({
      data: data as any,
      include: { franchise: true },
    });
    res.status(201).json(visit);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear visita' });
  }
});

// PATCH /api/visits/:id
router.patch('/:id', authenticate, requireVisitsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const { status, scheduledDate, endDate, assignedTo, internalNotes, motivo, detalle, franchiseId, urgency } = req.body;
    const visitId = req.params.id as string;

    // FRANQUICIA can only edit their own visits
    if (req.userRole === 'FRANQUICIA') {
      const existing = await prisma.visitRequest.findUnique({ where: { id: visitId } });
      if (!existing || existing.createdById !== req.userId) {
        res.status(403).json({ error: 'Acceso denegado' });
        return;
      }
    }

    // Solo mandamos los campos que efectivamente llegaron para no pisar con undefined.
    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (scheduledDate !== undefined) data.scheduledDate = scheduledDate === null ? null : new Date(scheduledDate);
    if (endDate !== undefined) data.endDate = endDate === null ? null : new Date(endDate);
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (internalNotes !== undefined) data.internalNotes = internalNotes;
    if (typeof motivo === 'string' && motivo.trim()) data.motivo = motivo.trim();
    if (typeof detalle === 'string' && detalle.trim()) data.detalle = detalle.trim();
    if (typeof franchiseId === 'string' && franchiseId.trim()) data.franchiseId = franchiseId.trim();
    if (typeof urgency === 'string' && urgency.trim()) data.urgency = urgency.trim();

    const visit = await prisma.visitRequest.update({
      where: { id: visitId },
      data,
      include: { franchise: true, createdBy: { omit: { password: true } } },
    });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar visita' });
  }
});

// DELETE /api/visits/:id
router.delete('/:id', authenticate, requireVisitsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const visitId = req.params.id as string;
    // FRANQUICIA can only delete their own visits
    if (req.userRole === 'FRANQUICIA') {
      const existing = await prisma.visitRequest.findUnique({ where: { id: visitId } });
      if (!existing || existing.createdById !== req.userId) {
        res.status(403).json({ error: 'Acceso denegado' });
        return;
      }
    }
    await prisma.visitRequest.delete({ where: { id: visitId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar visita' });
  }
});

export default router;
