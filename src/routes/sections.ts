import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireProjectEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const router = Router();

router.patch('/:sid', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }
    const section = await prisma.projectSection.update({
      where: { id: req.params.sid as string },
      data: { name: name.trim() },
    });
    res.json(section);
  } catch {
    res.status(500).json({ error: 'Error al actualizar la sección' });
  }
});

router.delete('/:sid', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    await prisma.projectSection.delete({ where: { id: req.params.sid as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la sección' });
  }
});

export default router;
