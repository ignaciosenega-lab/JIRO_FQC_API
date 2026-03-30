import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/tickets?status=xxx
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    // Franchise users only see their own tickets
    if (req.userRole === 'FRANCHISE') where.createdById = req.userId;

    const tickets = await prisma.ticket.findMany({
      where,
      include: { messages: { orderBy: { createdAt: 'asc' } }, franchise: true, createdBy: { omit: { password: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

// POST /api/tickets
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, priority, franchiseId } = req.body;
    if (!title?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'Título y descripción requeridos' });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        category: category || 'General',
        priority: priority || 'MEDIUM',
        createdById: req.userId!,
        franchiseId,
        messages: {
          create: [
            { content: description, role: 'franchise', authorId: req.userId },
            { content: 'Ticket creado. Esperando asignación de agente.', role: 'system' },
          ],
        },
      },
      include: { messages: true, franchise: true },
    });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear ticket' });
  }
});

// PATCH /api/tickets/:id
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, assignedAgent, assignedAvatar } = req.body;
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status, assignedAgent, assignedAvatar },
      include: { messages: true },
    });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar ticket' });
  }
});

// POST /api/tickets/:id/messages
router.post('/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content, role } = req.body;
    const message = await prisma.ticketMessage.create({
      data: {
        content,
        role: role || 'agent',
        ticketId: req.params.id,
        authorId: req.userId,
      },
    });
    // Update ticket timestamp
    await prisma.ticket.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

export default router;
