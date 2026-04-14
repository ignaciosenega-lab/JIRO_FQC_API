import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type AppRole = 'SUPERADMIN' | 'MANAGER' | 'OPERACIONES' | 'FRANQUICIA';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: AppRole;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: AppRole };
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireRole(...allowed: AppRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowed.includes(req.userRole)) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }
    next();
  };
}

export const requireSuperadmin = requireRole('SUPERADMIN');
