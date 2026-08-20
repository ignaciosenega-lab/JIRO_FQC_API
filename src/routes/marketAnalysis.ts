import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { MARKET_ANALYSIS_SYSTEM_PROMPT, buildUserPrompt } from '../prompts/marketAnalysis';

const router = Router();
const requireEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

// ── AI callers ──────────────────────────────────────────────────
// Cada uno devuelve { markdown, citations } o lanza. Sin fallback silencioso.

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const OPENAI_MODEL = 'gpt-4o';

// ── JIRO network context ────────────────────────────────────────
// Arma un bloque markdown compacto con la red completa de franquicias para
// que la IA lo use como benchmark interno al analizar zonas nuevas.
// Devuelve null si no hay datos de ventas todavía.
async function buildJiroNetworkContext(): Promise<string | null> {
  // Último período con datos.
  const latest = await prisma.salesByChannel.findFirst({
    orderBy: { periodo: 'desc' },
    select: { periodo: true },
  });
  if (!latest) return null;
  const periodo = latest.periodo;

  const rows = await prisma.salesByChannel.findMany({
    where: { periodo },
    include: { franchise: { select: { name: true, barrio: true, city: true, zona: true } } },
  });
  if (rows.length === 0) return null;

  // Agregado por franquicia (suma canales).
  const byFranchise = new Map<string, { name: string; barrio: string; city: string; zona: string; orders: number; revenue: number }>();
  for (const r of rows) {
    const key = r.franchiseId;
    const existing = byFranchise.get(key) || {
      name: r.franchise.name,
      barrio: r.franchise.barrio || '',
      city: r.franchise.city || '',
      zona: r.franchise.zona || '',
      orders: 0,
      revenue: 0,
    };
    existing.orders += r.orders;
    existing.revenue += r.revenue;
    byFranchise.set(key, existing);
  }
  const franchises = Array.from(byFranchise.values()).sort((a, b) => b.revenue - a.revenue);

  // Mix de canales a nivel red.
  const byChannel = new Map<string, { orders: number; revenue: number }>();
  let totalRevenue = 0;
  let totalOrders = 0;
  for (const r of rows) {
    const e = byChannel.get(r.channel) || { orders: 0, revenue: 0 };
    e.orders += r.orders;
    e.revenue += r.revenue;
    byChannel.set(r.channel, e);
    totalRevenue += r.revenue;
    totalOrders += r.orders;
  }
  const channelMix = Array.from(byChannel.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([channel, v]) => `${channel} ${((v.revenue / totalRevenue) * 100).toFixed(0)}%`)
    .join(' · ');

  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

  const lines: string[] = [];
  lines.push('## Datos internos JIRO — Red de franquicias');
  lines.push(`_Fuente primaria. Último mes cerrado: ${periodo}. Usá estos números como benchmark cuantitativo — NO son datos externos, son operativos reales de nuestros locales._`);
  lines.push('');
  lines.push(`**Resumen red:** ${franchises.length} locales · ${fmtM(totalRevenue)} facturación total · ${totalOrders.toLocaleString('es-AR')} pedidos · ticket promedio ${fmt(avgTicket)}.`);
  lines.push('');
  lines.push(`**Mix de canales:** ${channelMix}.`);
  lines.push('');
  lines.push('**Ranking de locales por facturación mensual:**');
  lines.push('');
  lines.push('| # | Local | Zona | Facturación | Pedidos | Ticket |');
  lines.push('|---|-------|------|-------------|---------|--------|');
  franchises.forEach((f, i) => {
    const zona = [f.barrio, f.city, f.zona].filter(Boolean).join(' · ') || '—';
    const ticket = f.orders > 0 ? f.revenue / f.orders : 0;
    lines.push(`| ${i + 1} | ${f.name.replace(/\|/g, '')} | ${zona.replace(/\|/g, '')} | ${fmt(f.revenue)} | ${f.orders.toLocaleString('es-AR')} | ${fmt(ticket)} |`);
  });
  return lines.join('\n');
}

async function callClaudeWithSearch(system: string, userPrompt: string): Promise<{ markdown: string; citations: any }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada en el server');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      system,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 40 }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data: any = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Anthropic error ${resp.status}`);
  // El response Anthropic viene como array de content blocks; concatenar los text blocks.
  const blocks = Array.isArray(data.content) ? data.content : [];
  const markdown = blocks
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  // Citas: los tool_use / server_tool_use aparecen como bloques; los extraemos si están.
  const citations = blocks
    .filter((b: any) => b.type === 'web_search_tool_result' || b.type === 'server_tool_use')
    .map((b: any) => b);
  return { markdown, citations };
}

async function callOpenAIWithSearch(system: string, userPrompt: string): Promise<{ markdown: string; citations: any }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada en el server');
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      tools: [{ type: 'web_search' }],
    }),
  });
  const data: any = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `OpenAI Responses error ${resp.status}`);
  // Responses API: output_text convenience field o iterar output[].content[].text
  let markdown: string = data.output_text || '';
  if (!markdown && Array.isArray(data.output)) {
    const parts: string[] = [];
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
        }
      }
    }
    markdown = parts.join('\n').trim();
  }
  // Citations: los items de tipo web_search_call incluyen resultados si están.
  const citations = Array.isArray(data.output)
    ? data.output.filter((o: any) => o.type === 'web_search_call' || o.type === 'file_search_call')
    : [];
  return { markdown: markdown.trim(), citations };
}

// Corre la generación en background (no bloqueamos el request).
async function runGeneration(analysisId: string) {
  const a = await prisma.marketAnalysis.findUnique({ where: { id: analysisId } });
  if (!a) return;
  // Enriquecemos con la red interna si hay datos de ventas. Si no, seguimos igual.
  const jiroNetwork = await buildJiroNetworkContext().catch(() => null);
  const userPrompt = buildUserPrompt({
    title: a.title,
    address: a.address,
    lat: a.lat,
    lng: a.lng,
    radiusKm: a.radiusKm,
    rubro: a.rubro,
    inputContext: a.inputContext,
    jiroNetwork,
  });

  try {
    if (a.model === 'openai') {
      const r = await callOpenAIWithSearch(MARKET_ANALYSIS_SYSTEM_PROMPT, userPrompt);
      await prisma.marketAnalysis.update({
        where: { id: analysisId },
        data: { status: 'completed', reportMarkdown: r.markdown, citations: r.citations as any },
      });
    } else if (a.model === 'anthropic') {
      const r = await callClaudeWithSearch(MARKET_ANALYSIS_SYSTEM_PROMPT, userPrompt);
      await prisma.marketAnalysis.update({
        where: { id: analysisId },
        data: { status: 'completed', reportMarkdown: r.markdown, citations: r.citations as any },
      });
    } else {
      // 'both' — corre los dos en paralelo. Si uno falla, guardamos el que salió.
      const [claudeR, openaiR] = await Promise.allSettled([
        callClaudeWithSearch(MARKET_ANALYSIS_SYSTEM_PROMPT, userPrompt),
        callOpenAIWithSearch(MARKET_ANALYSIS_SYSTEM_PROMPT, userPrompt),
      ]);
      const claudeMd = claudeR.status === 'fulfilled' ? claudeR.value.markdown : `❌ Claude falló: ${(claudeR as any).reason?.message || 'error'}`;
      const openaiMd = openaiR.status === 'fulfilled' ? openaiR.value.markdown : `❌ ChatGPT falló: ${(openaiR as any).reason?.message || 'error'}`;
      const citations = {
        claude: claudeR.status === 'fulfilled' ? claudeR.value.citations : null,
        openai: openaiR.status === 'fulfilled' ? openaiR.value.citations : null,
      };
      await prisma.marketAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'completed',
          reportMarkdown: claudeMd,
          reportMarkdownAlt: openaiMd,
          citations: citations as any,
        },
      });
    }
  } catch (err: any) {
    await prisma.marketAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorMessage: err?.message || 'Error generando informe' },
    });
  }
}

// ── Routes ──────────────────────────────────────────────────────

// GET /api/market-analysis — lista
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.marketAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, address: true, model: true, status: true,
        createdAt: true, updatedAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar análisis' });
  }
});

// GET /api/market-analysis/:id — detalle
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const row = await prisma.marketAnalysis.findUnique({
      where: { id: req.params.id as string },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!row) { res.status(404).json({ error: 'Análisis no encontrado' }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// POST /api/market-analysis — crea + dispara generación en background
router.post('/', authenticate, requireEditor, async (req: AuthRequest, res: Response) => {
  try {
    const { title, address, lat, lng, radiusKm, rubro, inputContext, model } = req.body || {};
    if (!title || !String(title).trim()) {
      res.status(400).json({ error: 'title es obligatorio' });
      return;
    }
    const chosenModel = ['openai', 'anthropic', 'both'].includes(model) ? model : 'both';
    const row = await prisma.marketAnalysis.create({
      data: {
        title: String(title).trim(),
        address: String(address || '').trim(),
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        radiusKm: radiusKm != null ? Number(radiusKm) : 4,
        rubro: String(rubro || 'sushi delivery/takeaway'),
        inputContext: String(inputContext || ''),
        model: chosenModel,
        status: 'generating',
        createdById: req.userId!,
      },
    });
    // Fire and forget — el frontend hace polling por status.
    runGeneration(row.id).catch(() => {});
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al crear análisis' });
  }
});

// POST /api/market-analysis/:id/regenerate — vuelve a correr con el mismo input
router.post('/:id/regenerate', authenticate, requireEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.marketAnalysis.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Análisis no encontrado' }); return; }
    await prisma.marketAnalysis.update({
      where: { id },
      data: { status: 'generating', errorMessage: '' },
    });
    runGeneration(id).catch(() => {});
    res.json({ status: 'generating' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al regenerar' });
  }
});

// PATCH /api/market-analysis/:id — edita título / markdown manualmente
router.patch('/:id', authenticate, requireEditor, async (req: AuthRequest, res: Response) => {
  try {
    const { title, reportMarkdown, reportMarkdownAlt } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (typeof reportMarkdown === 'string') data.reportMarkdown = reportMarkdown;
    if (typeof reportMarkdownAlt === 'string') data.reportMarkdownAlt = reportMarkdownAlt;
    const row = await prisma.marketAnalysis.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al actualizar' });
  }
});

// POST /api/market-analysis/import — pega un markdown ya generado por fuera
router.post('/import', authenticate, requireEditor, async (req: AuthRequest, res: Response) => {
  try {
    const { title, address, reportMarkdown } = req.body || {};
    if (!title || !reportMarkdown) {
      res.status(400).json({ error: 'title y reportMarkdown son obligatorios' });
      return;
    }
    const row = await prisma.marketAnalysis.create({
      data: {
        title: String(title).trim(),
        address: String(address || '').trim(),
        model: 'imported',
        status: 'completed',
        reportMarkdown: String(reportMarkdown),
        createdById: req.userId!,
      },
    });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al importar' });
  }
});

// DELETE /api/market-analysis/:id
router.delete('/:id', authenticate, requireEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.marketAnalysis.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Análisis no encontrado' }); return; }
    // Solo el creador o SUPERADMIN pueden borrar.
    if (existing.createdById !== req.userId && req.userRole !== 'SUPERADMIN') {
      res.status(403).json({ error: 'Solo el creador o un SUPERADMIN pueden eliminar este análisis' });
      return;
    }
    await prisma.marketAnalysis.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al eliminar' });
  }
});

export default router;
