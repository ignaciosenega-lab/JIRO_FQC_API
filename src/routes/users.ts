import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { authenticate, requireSuperadmin, AuthRequest, AppRole } from '../middleware/auth';

const router = Router();

const VALID_ROLES: AppRole[] = ['SUPERADMIN', 'MANAGER', 'OPERACIONES', 'FRANQUICIA'];

function isValidRole(role: unknown): role is AppRole {
  return typeof role === 'string' && VALID_ROLES.includes(role as AppRole);
}

async function countActiveSuperadmins(excludeId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'SUPERADMIN',
      active: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

// GET /api/users
router.get('/', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { franchise: true },
      omit: { password: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/users
router.post('/', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, franchiseId } = req.body;

    if (!email?.trim() || !password || !name?.trim()) {
      res.status(400).json({ error: 'Email, contraseña y nombre requeridos' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const finalRole: AppRole = isValidRole(role) ? role : 'FRANQUICIA';
    if (finalRole === 'FRANQUICIA' && !franchiseId) {
      res.status(400).json({ error: 'El rol FRANQUICIA requiere una franquicia asignada' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.trim(),
        password: hashed,
        name: name.trim(),
        role: finalRole,
        franchiseId: franchiseId || null,
      },
      include: { franchise: true },
      omit: { password: true },
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un usuario con ese email' });
      return;
    }
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PATCH /api/users/:id
router.patch('/:id', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, active, franchiseId, password } = req.body;
    const targetId = req.params.id as string;

    const current = await prisma.user.findUnique({ where: { id: targetId } });
    if (!current) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    if (role !== undefined && !isValidRole(role)) {
      res.status(400).json({ error: 'Rol inválido' });
      return;
    }

    const nextRole: AppRole = (role ?? current.role) as AppRole;
    const nextFranchiseId = franchiseId !== undefined ? franchiseId : current.franchiseId;
    if (nextRole === 'FRANQUICIA' && !nextFranchiseId) {
      res.status(400).json({ error: 'El rol FRANQUICIA requiere una franquicia asignada' });
      return;
    }

    // Self-protection
    const isSelf = req.userId === targetId;
    if (isSelf && role !== undefined && role !== current.role) {
      res.status(400).json({ error: 'No podés cambiar tu propio rol' });
      return;
    }
    if (isSelf && active === false) {
      res.status(400).json({ error: 'No podés desactivarte a vos mismo' });
      return;
    }

    // Last-superadmin protection
    const isDegradingSuperadmin =
      current.role === 'SUPERADMIN' &&
      ((role !== undefined && role !== 'SUPERADMIN') || active === false);
    if (isDegradingSuperadmin) {
      const remaining = await countActiveSuperadmins(targetId);
      if (remaining === 0) {
        res.status(400).json({ error: 'Debe quedar al menos un SUPERADMIN activo' });
        return;
      }
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (franchiseId !== undefined) data.franchiseId = franchiseId || null;
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
      }
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data,
      include: { franchise: true },
      omit: { password: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id — soft delete (active=false)
router.delete('/:id', authenticate, requireSuperadmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.params.id as string;

    if (req.userId === targetId) {
      res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
      return;
    }

    const current = await prisma.user.findUnique({ where: { id: targetId } });
    if (!current) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    if (current.role === 'SUPERADMIN') {
      const remaining = await countActiveSuperadmins(targetId);
      if (remaining === 0) {
        res.status(400).json({ error: 'Debe quedar al menos un SUPERADMIN activo' });
        return;
      }
    }

    await prisma.user.update({ where: { id: targetId }, data: { active: false } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;
