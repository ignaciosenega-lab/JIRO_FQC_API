import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireSuperadmin, AuthRequest } from '../middleware/auth';

const router = Router();

interface CategoryInput {
  id: string;
  number: string;
  title: string;
  items: { name: string }[];
}

function validateCategories(value: unknown): value is CategoryInput[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (c) =>
      c &&
      typeof c.id === 'string' &&
      typeof c.number === 'string' &&
      typeof c.title === 'string' &&
      Array.isArray(c.items) &&
      c.items.every((i: any) => i && typeof i.name === 'string')
  );
}

// GET /api/audits-config — any authenticated user
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    let config = await prisma.auditConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.auditConfig.create({
        data: { id: 'singleton', cocinaCategories: '[]', cajasCategories: '[]' },
      });
    }
    res.json({
      cocinaCategories: JSON.parse(config.cocinaCategories || '[]'),
      cajasCategories: JSON.parse(config.cajasCategories || '[]'),
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la configuración de auditoría' });
  }
});

// PATCH /api/audits-config — superadmin only
router.patch('/', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const { cocinaCategories, cajasCategories } = req.body;

    if (cocinaCategories !== undefined && !validateCategories(cocinaCategories)) {
      res.status(400).json({ error: 'cocinaCategories tiene un formato inválido' });
      return;
    }
    if (cajasCategories !== undefined && !validateCategories(cajasCategories)) {
      res.status(400).json({ error: 'cajasCategories tiene un formato inválido' });
      return;
    }

    const data: { cocinaCategories?: string; cajasCategories?: string } = {};
    if (cocinaCategories !== undefined) data.cocinaCategories = JSON.stringify(cocinaCategories);
    if (cajasCategories !== undefined) data.cajasCategories = JSON.stringify(cajasCategories);

    const config = await prisma.auditConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: {
        id: 'singleton',
        cocinaCategories: data.cocinaCategories ?? '[]',
        cajasCategories: data.cajasCategories ?? '[]',
      },
    });

    res.json({
      cocinaCategories: JSON.parse(config.cocinaCategories || '[]'),
      cajasCategories: JSON.parse(config.cajasCategories || '[]'),
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar la configuración de auditoría' });
  }
});

export default router;
