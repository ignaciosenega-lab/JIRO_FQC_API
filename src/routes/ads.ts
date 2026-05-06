import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.query.franchiseId as string | undefined;
    const where = franchiseId ? { franchiseId } : {};
    const data = await prisma.adIncome.findMany({
      where,
      include: { franchise: { select: { id: true, name: true } } },
      orderBy: [{ franchiseId: 'asc' }, { periodo: 'asc' }],
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener publicidad' });
  }
});

router.post('/', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const { franchiseId, periodo, monto, baseFacturacion, porcentaje, estado, cobro, notas } = req.body || {};
    if (!franchiseId || !periodo) {
      res.status(400).json({ error: 'franchiseId y periodo requeridos' });
      return;
    }
    const created = await prisma.adIncome.upsert({
      where: { franchiseId_periodo: { franchiseId, periodo } },
      create: {
        franchiseId,
        periodo,
        monto: Number(monto) || 0,
        baseFacturacion: Number(baseFacturacion) || 0,
        porcentaje: Number(porcentaje) || 0,
        estado: estado || 'pendiente',
        cobro: cobro || 'JIRONOSRL',
        notas: notas || '',
      },
      update: {
        monto: Number(monto) || 0,
        baseFacturacion: Number(baseFacturacion) || 0,
        porcentaje: Number(porcentaje) || 0,
        estado: estado || 'pendiente',
        cobro: cobro || 'JIRONOSRL',
        notas: notas || '',
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Error al guardar publicidad' });
  }
});

router.delete('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    await prisma.adIncome.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar publicidad' });
  }
});

export default router;
