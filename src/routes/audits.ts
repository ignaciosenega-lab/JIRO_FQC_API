import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/audits — list audits, optionally filtered by franchiseId
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { franchiseId } = req.query;
    const where: any = {};
    if (franchiseId) where.franchiseId = franchiseId;

    const audits = await prisma.audit.findMany({
      where,
      include: {
        franchise: { select: { id: true, name: true } },
        auditor: { select: { id: true, name: true } },
      },
      orderBy: { fecha: 'desc' },
    });
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener auditorías' });
  }
});

// GET /api/audits/:id — single audit detail
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const audit = await prisma.audit.findUnique({
      where: { id: req.params.id },
      include: {
        franchise: { select: { id: true, name: true } },
        auditor: { select: { id: true, name: true } },
      },
    });
    if (!audit) {
      res.status(404).json({ error: 'Auditoría no encontrada' });
      return;
    }
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// POST /api/audits — create audit and update franchise lastAuditScore
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      franchiseId, fecha, turno, tipoAuditoria, localNotificado,
      cocinaScores, cajasScores,
      cocinaTotal, cocinaMax, cajasTotal, cajasMax,
      hallazgosCocina, hallazgosCaja,
      accionesCorrectivas, nivelUrgencia, localObservado, observaciones,
      firmaResponsable, firmaConsultor,
    } = req.body;

    if (!franchiseId || !fecha || !turno || !tipoAuditoria) {
      res.status(400).json({ error: 'Faltan campos obligatorios: franchiseId, fecha, turno, tipoAuditoria' });
      return;
    }

    const cocinaPercent = cocinaMax > 0 ? (cocinaTotal / cocinaMax) * 100 : 0;
    const cajasPercent = cajasMax > 0 ? (cajasTotal / cajasMax) * 100 : 0;

    // Cocina and cajas are independent. lastAuditScore uses a simple average
    // so existing views (Dashboard, Units, Score) keep working with a single number.
    const auditScore = Math.round((cocinaPercent + cajasPercent) / 2);

    const audit = await prisma.audit.create({
      data: {
        franchiseId,
        fecha: new Date(fecha),
        turno,
        tipoAuditoria,
        localNotificado: localNotificado || '',
        cocinaScores: typeof cocinaScores === 'string' ? cocinaScores : JSON.stringify(cocinaScores || {}),
        cajasScores: typeof cajasScores === 'string' ? cajasScores : JSON.stringify(cajasScores || {}),
        cocinaTotal: cocinaTotal || 0,
        cocinaMax: cocinaMax || 0,
        cajasTotal: cajasTotal || 0,
        cajasMax: cajasMax || 0,
        cocinaPercent,
        cajasPercent,
        hallazgosCocina: hallazgosCocina || '',
        hallazgosCaja: hallazgosCaja || '',
        accionesCorrectivas: accionesCorrectivas || '',
        nivelUrgencia: nivelUrgencia || '',
        localObservado: localObservado || '',
        observaciones: observaciones || '',
        firmaResponsable: firmaResponsable || '',
        firmaConsultor: firmaConsultor || '',
        auditorId: req.userId!,
      },
      include: {
        franchise: { select: { id: true, name: true } },
        auditor: { select: { id: true, name: true } },
      },
    });

    // Update franchise lastAuditScore
    await prisma.franchise.update({
      where: { id: franchiseId },
      data: { lastAuditScore: auditScore },
    });

    res.status(201).json(audit);
  } catch (err) {
    console.error('Error creating audit:', err);
    res.status(500).json({ error: 'Error al crear auditoría' });
  }
});

export default router;
