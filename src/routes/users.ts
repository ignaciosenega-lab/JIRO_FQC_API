import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/users
router.get('/', authenticate, requireAdmin, async (_req: Request, res: Response) => {
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
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, franchiseId } = req.body;
    if (!email?.trim() || !password || !name?.trim()) {
      res.status(400).json({ error: 'Email, contraseña y nombre requeridos' });
      return;
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role: role || 'FRANCHISE', franchiseId },
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
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, role, active, franchiseId } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role, active, franchiseId },
      omit: { password: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

export default router;
