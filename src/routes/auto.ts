import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireAutoEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

async function ensureAuto() {
  const existing = await prisma.auto.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.auto.create({ data: { id: 'singleton', nombre: '', valorTotal: 0, notas: '' } });
}

// GET /api/auto  →  { auto, cuotas }
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const auto = await ensureAuto();
    const cuotas = await prisma.autoCuota.findMany({
      where: { autoId: auto.id },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ auto, cuotas });
  } catch {
    res.status(500).json({ error: 'Error al obtener el auto' });
  }
});

// PATCH /api/auto  →  actualiza nombre / valorTotal / notas
router.patch('/', authenticate, requireAutoEditor, async (req: Request, res: Response) => {
  try {
    const { nombre, valorTotal, notas } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof nombre === 'string') data.nombre = nombre;
    if (typeof valorTotal === 'number' && !isNaN(valorTotal)) data.valorTotal = valorTotal;
    if (typeof notas === 'string') data.notas = notas;
    await ensureAuto();
    const auto = await prisma.auto.update({ where: { id: 'singleton' }, data });
    res.json(auto);
  } catch {
    res.status(500).json({ error: 'Error al actualizar el auto' });
  }
});

// POST /api/auto/cuotas  →  crear cuota
router.post('/cuotas', authenticate, requireAutoEditor, async (req: Request, res: Response) => {
  try {
    const { monto, fecha, paidBy, notas } = req.body || {};
    if (typeof monto !== 'number' || isNaN(monto)) {
      res.status(400).json({ error: 'Monto inválido' });
      return;
    }
    if (!fecha) {
      res.status(400).json({ error: 'La fecha es obligatoria' });
      return;
    }
    await ensureAuto();
    const cuota = await prisma.autoCuota.create({
      data: {
        autoId: 'singleton',
        monto,
        fecha: new Date(fecha),
        paidBy: typeof paidBy === 'string' && paidBy ? paidBy : 'nacho',
        notas: typeof notas === 'string' ? notas : '',
      },
    });
    res.status(201).json(cuota);
  } catch {
    res.status(500).json({ error: 'Error al crear la cuota' });
  }
});

// PATCH /api/auto/cuotas/:id
router.patch('/cuotas/:id', authenticate, requireAutoEditor, async (req: Request, res: Response) => {
  try {
    const { monto, fecha, paidBy, notas } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof monto === 'number' && !isNaN(monto)) data.monto = monto;
    if (fecha) data.fecha = new Date(fecha);
    if (typeof paidBy === 'string') data.paidBy = paidBy;
    if (typeof notas === 'string') data.notas = notas;
    const cuota = await prisma.autoCuota.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(cuota);
  } catch {
    res.status(500).json({ error: 'Error al actualizar la cuota' });
  }
});

// DELETE /api/auto/cuotas/:id
router.delete('/cuotas/:id', authenticate, requireAutoEditor, async (req: Request, res: Response) => {
  try {
    await prisma.autoCuota.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la cuota' });
  }
});

export default router;
