import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireSuperadmin, AuthRequest, AppRole } from '../middleware/auth';

const router = Router();

const VALID_ROLES: AppRole[] = ['SUPERADMIN', 'MANAGER', 'OPERACIONES', 'FRANQUICIA'];
const VALID_VIEWS = ['dashboard', 'ai', 'ops', 'compliance', 'score', 'visits', 'units', 'users'];
const VALID_LEVELS = ['none', 'view', 'edit'];

const FULL_SUPERADMIN = VALID_VIEWS.reduce(
  (acc, v) => ({ ...acc, [v]: 'edit' }),
  {} as Record<string, string>
);

function validateMatrix(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const matrix = value as Record<string, unknown>;
  for (const role of VALID_ROLES) {
    const perms = matrix[role];
    if (!perms || typeof perms !== 'object') return false;
    const permsObj = perms as Record<string, unknown>;
    for (const view of VALID_VIEWS) {
      const level = permsObj[view];
      if (typeof level !== 'string' || !VALID_LEVELS.includes(level)) return false;
    }
  }
  return true;
}

// GET /api/role-permissions — any authenticated user (needed to render the UI)
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    let config = await prisma.rolePermissionsConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.rolePermissionsConfig.create({
        data: { id: 'singleton', permissions: '{}' },
      });
    }
    const matrix = JSON.parse(config.permissions || '{}');
    // Always force SUPERADMIN to full access so a bad write can't lock us out.
    matrix.SUPERADMIN = FULL_SUPERADMIN;
    res.json({ permissions: matrix, updatedAt: config.updatedAt });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los permisos de rol' });
  }
});

// PATCH /api/role-permissions — superadmin only
router.patch('/', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const { permissions } = req.body;
    if (!validateMatrix(permissions)) {
      res.status(400).json({ error: 'Formato inválido de matriz de permisos' });
      return;
    }

    // Force SUPERADMIN back to full access regardless of what was sent.
    const sanitized = { ...permissions, SUPERADMIN: FULL_SUPERADMIN };

    const config = await prisma.rolePermissionsConfig.upsert({
      where: { id: 'singleton' },
      update: { permissions: JSON.stringify(sanitized) },
      create: { id: 'singleton', permissions: JSON.stringify(sanitized) },
    });

    res.json({
      permissions: JSON.parse(config.permissions || '{}'),
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar los permisos de rol' });
  }
});

export default router;
