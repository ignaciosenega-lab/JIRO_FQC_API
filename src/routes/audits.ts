import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireSuperadmin, AuthRequest } from '../middleware/auth';

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
      accionesCorrectivas, accionesCorrectivasFechaVencimiento,
      nivelUrgencia, localObservado, observaciones,
      firmaResponsable, firmaConsultor,
    } = req.body;

    if (!franchiseId || !fecha || !turno || !tipoAuditoria) {
      res.status(400).json({ error: 'Faltan campos obligatorios: franchiseId, fecha, turno, tipoAuditoria' });
      return;
    }

    const cocinaPercent = cocinaMax > 0 ? (cocinaTotal / cocinaMax) * 100 : 0;
    const cajasPercent = cajasMax > 0 ? (cajasTotal / cajasMax) * 100 : 0;

    // A section with max === 0 was not audited (e.g. "Solo Cocina" skips cajas).
    // lastAuditScore ignores missing sections so partial audits aren't penalised.
    const hasCocina = cocinaMax > 0;
    const hasCajas = cajasMax > 0;
    let auditScore: number;
    if (hasCocina && hasCajas) auditScore = Math.round((cocinaPercent + cajasPercent) / 2);
    else if (hasCocina) auditScore = Math.round(cocinaPercent);
    else if (hasCajas) auditScore = Math.round(cajasPercent);
    else auditScore = 0;

    const auditDate = new Date(fecha);
    const audit = await prisma.audit.create({
      data: {
        franchiseId,
        fecha: auditDate,
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
        accionesCorrectivasFechaVencimiento: accionesCorrectivasFechaVencimiento ? new Date(accionesCorrectivasFechaVencimiento) : null,
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

    // Auto-create a completed visit linked to this audit
    const tipoLabel =
      tipoAuditoria === 'completa' ? 'Completa (Cocina + Cajas)' :
      tipoAuditoria === 'solo_cocina' ? 'Solo Cocina' :
      tipoAuditoria === 'solo_caja' ? 'Solo Cajas' :
      tipoAuditoria === 'seguimiento' ? 'Seguimiento' : tipoAuditoria;

    await prisma.visitRequest.create({
      data: {
        motivo: `Auditoría ${tipoLabel}`,
        detalle: `Auditoría realizada. Score: Cocina ${cocinaMax > 0 ? Math.round(cocinaPercent) + '%' : '—'}, Cajas ${cajasMax > 0 ? Math.round(cajasPercent) + '%' : '—'}.`,
        urgency: 'media',
        status: 'COMPLETADA',
        scheduledDate: auditDate,
        franchiseId,
        createdById: req.userId!,
      },
    });

    res.status(201).json(audit);
  } catch (err) {
    console.error('Error creating audit:', err);
    res.status(500).json({ error: 'Error al crear auditoría' });
  }
});

// PATCH /api/audits/:id/corrective-status — update checklist state
router.patch('/:id/corrective-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'object') {
      res.status(400).json({ error: 'Se requiere un objeto status' });
      return;
    }
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) {
      res.status(404).json({ error: 'Auditoría no encontrada' });
      return;
    }
    const updated = await prisma.audit.update({
      where: { id: req.params.id },
      data: { accionesCorrectivasStatus: JSON.stringify(status) },
    });
    res.json({ accionesCorrectivasStatus: JSON.parse(updated.accionesCorrectivasStatus) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado de acciones correctivas' });
  }
});

// DELETE /api/audits/:id — superadmin only
router.delete('/:id', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) {
      res.status(404).json({ error: 'Auditoría no encontrada' });
      return;
    }
    await prisma.audit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar auditoría' });
  }
});

export default router;
