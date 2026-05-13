import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const items = await prisma.employee.findMany({
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

router.post('/', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const { nombre, activo, notas } = req.body || {};
    if (!nombre?.trim()) {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }
    const created = await prisma.employee.create({
      data: { nombre: nombre.trim(), activo: activo !== false, notas: notas || '' },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

router.patch('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
});

router.delete('/:id', authenticate, requireEditor, async (req: Request, res: Response) => {
  try {
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
});

export default router;
