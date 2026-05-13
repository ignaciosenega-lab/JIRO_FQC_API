import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = req.query.periodo as string | undefined;
    const where = periodo ? { periodo } : {};
    const items = await prisma.otherExpense.findMany({
      where,
      orderBy: [{ periodo: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Error al obtener otros gastos' });
  }
});

router.post('/', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const { periodo, descripcion, monto, paidBy, pagado, notas } = req.body || {};
    if (!periodo || !descripcion?.trim()) {
      res.status(400).json({ error: 'periodo y descripcion requeridos' });
      return;
    }
    const created = await prisma.otherExpense.create({
      data: {
        periodo,
        descripcion: descripcion.trim(),
        monto: Number(monto) || 0,
        paidBy: paidBy === 'lean' ? 'lean' : 'nacho',
        pagado: !!pagado,
        notas: notas || '',
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Error al crear gasto' });
  }
});

router.patch('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const updated = await prisma.otherExpense.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error al actualizar gasto' });
  }
});

router.delete('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    await prisma.otherExpense.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar gasto' });
  }
});

export default router;
