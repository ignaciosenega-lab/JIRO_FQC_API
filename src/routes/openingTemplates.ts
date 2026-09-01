import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireSuperadmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/opening-templates
// Lista todos los templates. ?all=1 incluye los soft-deleted (active=false).
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.all === '1';
    const templates = await prisma.openingTaskTemplate.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ mode: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
    });
    res.json(templates);
  } catch (err) {
    console.error('[opening-templates] GET error:', err);
    res.status(500).json({ error: 'Error al listar templates' });
  }
});

// POST /api/opening-templates — SUPERADMIN
router.post('/', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.id || !b.mode || !b.tipo || !b.grupo || !b.tarea) {
      res.status(400).json({ error: 'id, mode, tipo, grupo y tarea son obligatorios' });
      return;
    }
    const t = await prisma.openingTaskTemplate.create({
      data: {
        id: String(b.id),
        mode: String(b.mode),
        tipo: String(b.tipo),
        grupo: String(b.grupo),
        orden: typeof b.orden === 'number' ? b.orden : 0,
        tarea: String(b.tarea),
        categoria: b.categoria || null,
        semana: b.semana || null,
        responsableSugerido: b.responsableSugerido || null,
        diasEstimados: typeof b.diasEstimados === 'number' ? b.diasEstimados : null,
        notas: b.notas || '',
      },
    });
    res.status(201).json(t);
  } catch (err) {
    console.error('[opening-templates] POST error:', err);
    res.status(500).json({ error: 'Error al crear template' });
  }
});

// PATCH /api/opening-templates/:id — SUPERADMIN
router.patch('/:id', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    for (const k of ['mode', 'tipo', 'grupo', 'tarea', 'categoria', 'semana', 'responsableSugerido', 'notas'] as const) {
      if (typeof b[k] === 'string') data[k] = b[k];
    }
    if (typeof b.orden === 'number') data.orden = b.orden;
    if (typeof b.diasEstimados === 'number' || b.diasEstimados === null) data.diasEstimados = b.diasEstimados;
    if (typeof b.active === 'boolean') data.active = b.active;

    const t = await prisma.openingTaskTemplate.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(t);
  } catch (err) {
    console.error('[opening-templates] PATCH error:', err);
    res.status(500).json({ error: 'Error al actualizar template' });
  }
});

// DELETE /api/opening-templates/:id — SUPERADMIN. Soft-delete (active=false).
router.delete('/:id', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.openingTaskTemplate.update({
      where: { id: req.params.id as string },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[opening-templates] DELETE error:', err);
    res.status(500).json({ error: 'Error al eliminar template' });
  }
});

export default router;
