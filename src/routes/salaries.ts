import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = req.query.periodo as string | undefined;
    const where = periodo ? { periodo } : {};
    const items = await prisma.salary.findMany({
      where,
      include: { employee: { select: { id: true, nombre: true, activo: true } } },
      orderBy: [{ periodo: 'asc' }],
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Error al obtener sueldos' });
  }
});

router.post('/', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const { employeeId, periodo, blancoAmount, blancoPaidBy, negroAmount, negroPaidBy, presentismoAmount, presentismoPaidBy, pagado, notas } = req.body || {};
    if (!employeeId || !periodo) {
      res.status(400).json({ error: 'employeeId y periodo requeridos' });
      return;
    }
    const normPaidBy = (v: any, def: 'nacho' | 'lean'): 'nacho' | 'lean' =>
      v === 'lean' ? 'lean' : v === 'nacho' ? 'nacho' : def;
    const created = await prisma.salary.upsert({
      where: { employeeId_periodo: { employeeId, periodo } },
      create: {
        employeeId,
        periodo,
        blancoAmount: Number(blancoAmount) || 0,
        blancoPaidBy: normPaidBy(blancoPaidBy, 'lean'),
        negroAmount: Number(negroAmount) || 0,
        negroPaidBy: normPaidBy(negroPaidBy, 'nacho'),
        presentismoAmount: Number(presentismoAmount) || 0,
        presentismoPaidBy: normPaidBy(presentismoPaidBy, 'nacho'),
        pagado: !!pagado,
        notas: notas || '',
      },
      update: {
        blancoAmount: Number(blancoAmount) || 0,
        blancoPaidBy: normPaidBy(blancoPaidBy, 'lean'),
        negroAmount: Number(negroAmount) || 0,
        negroPaidBy: normPaidBy(negroPaidBy, 'nacho'),
        presentismoAmount: Number(presentismoAmount) || 0,
        presentismoPaidBy: normPaidBy(presentismoPaidBy, 'nacho'),
        pagado: !!pagado,
        notas: notas || '',
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Error al guardar sueldo' });
  }
});

router.delete('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    await prisma.salary.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar sueldo' });
  }
});

export default router;
