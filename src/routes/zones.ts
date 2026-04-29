import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireZoneEditor = requireRole('SUPERADMIN', 'MANAGER');

const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({
      include: { franchises: { select: { id: true, name: true } } },
      orderBy: [{ provincia: 'asc' }, { partidoComuna: 'asc' }, { nombre: 'asc' }],
    });
    res.json(zones);
  } catch {
    res.status(500).json({ error: 'Error al obtener zonas' });
  }
});

router.post('/', authenticate, requireZoneEditor, async (req: Request, res: Response) => {
  try {
    const data = req.body || {};
    if (!data.nombre?.trim()) {
      res.status(400).json({ error: 'Nombre de zona requerido' });
      return;
    }
    const zone = await prisma.zone.create({ data });
    res.status(201).json(zone);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe una zona con esos datos' });
      return;
    }
    res.status(500).json({ error: 'Error al crear zona' });
  }
});

router.patch('/:id', authenticate, requireZoneEditor, async (req: Request, res: Response) => {
  try {
    const zone = await prisma.zone.update({ where: { id: req.params.id }, data: req.body });
    res.json(zone);
  } catch {
    res.status(500).json({ error: 'Error al actualizar zona' });
  }
});

router.delete('/:id', authenticate, requireZoneEditor, async (req: Request, res: Response) => {
  try {
    await prisma.zone.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar zona' });
  }
});

router.post('/bulk', authenticate, requireZoneEditor, async (req: Request, res: Response) => {
  try {
    const items: any[] = Array.isArray(req.body?.zones) ? req.body.zones : [];
    if (items.length === 0) {
      res.status(400).json({ error: 'No se enviaron zonas' });
      return;
    }
    const result = await prisma.zone.createMany({
      data: items.filter((z) => z?.nombre?.trim()),
      skipDuplicates: true,
    });
    res.json({ created: result.count });
  } catch {
    res.status(500).json({ error: 'Error al importar zonas' });
  }
});

export default router;
