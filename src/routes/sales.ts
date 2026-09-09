import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { readSheet } from '../lib/googleSheets';

const requireSalesEditor = requireRole('SUPERADMIN', 'MANAGER');
const requireSuperadmin = requireRole('SUPERADMIN');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// ── Canonical channels (para orden y validación) ──────────
const CHANNELS = [
  'Local',
  'Rappi',
  'Rappi Turbo',
  'Rappi Veggie',
  'Pedidos Ya',
  'Mas delivery',
  'Mercado Pago',
  'Mercado Pago Veggie',
] as const;

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

// ── Fuzzy match name → franchiseId (mismo enfoque que aiBilling.ts, simplificado) ──
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/jiro\s*sushi\s*/g, '')
    .replace(/sushi\s*/g, '')
    .replace(/jiro\s*/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[b.length][a.length];
}

function matchFranchiseId(name: string, franchises: Array<{ id: string; name: string }>): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  for (const f of franchises) if (normalizeName(f.name) === norm) return f.id;
  for (const f of franchises) {
    const fn = normalizeName(f.name);
    if (fn && (fn.includes(norm) || norm.includes(fn))) return f.id;
  }
  let best: { id: string; dist: number } | null = null;
  for (const f of franchises) {
    const fn = normalizeName(f.name);
    if (!fn) continue;
    const d = levenshtein(norm, fn);
    const t = Math.min(3, Math.floor(Math.max(norm.length, fn.length) * 0.25));
    if (d <= t && (!best || d < best.dist)) best = { id: f.id, dist: d };
  }
  return best?.id || null;
}

// ── GET /api/sales/summary?periodo=YYYY-MM ────────────────
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = String(req.query.periodo || '');
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      res.status(400).json({ error: 'periodo requerido (YYYY-MM)' });
      return;
    }
    const [y, m] = periodo.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

    const [current, previous, currentTotal, prevTotal] = await Promise.all([
      prisma.salesByChannel.findMany({
        where: { periodo },
        include: { franchise: { select: { id: true, name: true } } },
      }),
      prisma.salesByChannel.findMany({ where: { periodo: prev } }),
      // SalesMonthlyTotal: totales agregados de red (Google Sheet "Análisis
      // Jiro"). Cuando existen, tienen prioridad sobre la suma de
      // SalesByChannel — el sheet es la fuente de verdad para el número grande.
      prisma.salesMonthlyTotal.findUnique({ where: { periodo } }),
      prisma.salesMonthlyTotal.findUnique({ where: { periodo: prev } }),
    ]);

    // Priorizar SalesMonthlyTotal para KPIs generales; fallback a suma de canales.
    const totalOrders = currentTotal?.orders ?? current.reduce((s, r) => s + r.orders, 0);
    const totalRevenue = currentTotal?.revenue ?? current.reduce((s, r) => s + r.revenue, 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevRevenue = prevTotal?.revenue ?? previous.reduce((s, r) => s + r.revenue, 0);
    const prevMonthDelta = prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : null;

    // Ranking por local
    const byFranchise = new Map<string, { franchiseId: string; name: string; orders: number; revenue: number }>();
    for (const r of current) {
      const key = r.franchiseId;
      const existing = byFranchise.get(key) || { franchiseId: key, name: r.franchise.name, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      byFranchise.set(key, existing);
    }
    const ranking = Array.from(byFranchise.values()).sort((a, b) => b.revenue - a.revenue);

    // Mix por canal
    const byChannel = new Map<string, { channel: string; orders: number; revenue: number }>();
    for (const r of current) {
      const existing = byChannel.get(r.channel) || { channel: r.channel, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      byChannel.set(r.channel, existing);
    }
    const channelMix = Array.from(byChannel.values())
      .map((c) => ({ ...c, pct: totalRevenue > 0 ? c.revenue / totalRevenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      periodo,
      prev,
      totalOrders,
      totalRevenue,
      avgTicket,
      prevMonthDelta,
      ranking,
      channelMix,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resumen de ventas' });
  }
});

// ── GET /api/sales/monthly?franchiseId=&channel=&from=&to= ─
// Serie temporal para gráficos de evolución.
router.get('/monthly', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.query.franchiseId as string | undefined;
    const channel = req.query.channel as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const where: Record<string, unknown> = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (channel) where.channel = channel;
    if (from || to) {
      const p: Record<string, string> = {};
      if (from) p.gte = from;
      if (to) p.lte = to;
      where.periodo = p;
    }
    const rows = await prisma.salesByChannel.findMany({
      where,
      orderBy: [{ periodo: 'asc' }],
    });

    // Agregamos por periodo (y por canal si no viene fijo) para devolver serie limpia.
    const map = new Map<string, { periodo: string; orders: number; revenue: number }>();
    for (const r of rows) {
      const key = r.periodo;
      const existing = map.get(key) || { periodo: key, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      map.set(key, existing);
    }
    res.json(Array.from(map.values()));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener serie mensual' });
  }
});

// ── GET /api/sales/franchise/:id?periodo=YYYY-MM ──────────
router.get('/franchise/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.params.id as string;
    const periodo = String(req.query.periodo || '');
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      res.status(400).json({ error: 'periodo requerido (YYYY-MM)' });
      return;
    }
    const [y, m] = periodo.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

    const [current, previous, history] = await Promise.all([
      prisma.salesByChannel.findMany({ where: { franchiseId, periodo } }),
      prisma.salesByChannel.findMany({ where: { franchiseId, periodo: prev } }),
      prisma.salesByChannel.findMany({ where: { franchiseId }, orderBy: [{ periodo: 'asc' }] }),
    ]);

    const totalOrders = current.reduce((s, r) => s + r.orders, 0);
    const totalRevenue = current.reduce((s, r) => s + r.revenue, 0);
    const prevRevenue = previous.reduce((s, r) => s + r.revenue, 0);
    const delta = prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : null;

    const historyByMonth = new Map<string, { periodo: string; orders: number; revenue: number }>();
    for (const r of history) {
      const e = historyByMonth.get(r.periodo) || { periodo: r.periodo, orders: 0, revenue: 0 };
      e.orders += r.orders;
      e.revenue += r.revenue;
      historyByMonth.set(r.periodo, e);
    }

    res.json({
      franchiseId,
      periodo,
      totalOrders,
      totalRevenue,
      avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      delta,
      channels: current.sort((a, b) => b.revenue - a.revenue),
      history: Array.from(historyByMonth.values()),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener detalle de la franquicia' });
  }
});

// ── GET /api/sales/weekday?periodo=YYYY-MM ────────────────
router.get('/weekday', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = req.query.periodo as string | undefined;
    const where: Record<string, unknown> = {};
    if (periodo) where.periodo = periodo;
    const rows = await prisma.salesWeekday.findMany({ where, orderBy: [{ periodo: 'asc' }] });
    // Orden lógico dentro de cada periodo (lunes → domingo).
    const idx = (w: string) => WEEKDAYS.indexOf(w as (typeof WEEKDAYS)[number]);
    rows.sort((a, b) => (a.periodo === b.periodo ? idx(a.weekday) - idx(b.weekday) : a.periodo.localeCompare(b.periodo)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener distribución semanal' });
  }
});

// ── POST /api/sales/upload ── CSV con columnas: local, periodo, canal, orders, revenue
router.post('/upload', authenticate, requireSalesEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Archivo requerido' });
      return;
    }
    const text = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });

    let matched = 0;
    let missing = 0;
    const missingNames = new Set<string>();
    const rows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];

    for (const raw of parsed.data as Array<Record<string, string>>) {
      const local = String(raw.local || raw.Local || raw.franchise || raw.sucursal || '').trim();
      const periodo = String(raw.periodo || raw.Periodo || raw.period || '').trim();
      const channel = String(raw.canal || raw.channel || raw.Canal || '').trim();
      const orders = Number(raw.orders || raw.pedidos || raw.ordenes || 0);
      const revenue = Number(raw.revenue || raw.facturacion || raw.facturación || raw.ventas || 0);
      if (!local || !periodo || !channel) continue;
      if (!/^\d{4}-\d{2}$/.test(periodo)) continue;
      const fid = matchFranchiseId(local, franchises);
      if (!fid) { missing++; missingNames.add(local); continue; }
      matched++;
      rows.push({ franchiseId: fid, periodo, channel, orders: isFinite(orders) ? orders : 0, revenue: isFinite(revenue) ? revenue : 0 });
    }

    await prisma.$transaction(
      rows.map((r) =>
        prisma.salesByChannel.upsert({
          where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
          create: r,
          update: { orders: r.orders, revenue: r.revenue },
        })
      )
    );

    res.json({ imported: rows.length, matched, missing, missingNames: Array.from(missingNames) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al importar CSV' });
  }
});

// ── POST /api/sales/import-2026 ── import inicial idempotente desde JSON estático
// Requiere SUPERADMIN. El JSON vive en scripts/data/sales-2026.json.
router.post('/import-2026', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dataset = require('../../scripts/data/sales-2026.json') as {
      salesByChannel: Array<{ local: string; periodo: string; channel: string; orders: number; revenue: number }>;
      weekday: Array<{ periodo: string; weekday: string; orders: number; revenue: number }>;
    };

    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });
    const missingNames = new Set<string>();
    const channelRows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];
    for (const raw of dataset.salesByChannel) {
      const fid = matchFranchiseId(raw.local, franchises);
      if (!fid) { missingNames.add(raw.local); continue; }
      channelRows.push({ franchiseId: fid, periodo: raw.periodo, channel: raw.channel, orders: raw.orders, revenue: raw.revenue });
    }

    await prisma.$transaction([
      ...channelRows.map((r) =>
        prisma.salesByChannel.upsert({
          where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
          create: r,
          update: { orders: r.orders, revenue: r.revenue },
        })
      ),
      ...dataset.weekday.map((w) =>
        prisma.salesWeekday.upsert({
          where: { periodo_weekday: { periodo: w.periodo, weekday: w.weekday } },
          create: w,
          update: { orders: w.orders, revenue: w.revenue },
        })
      ),
    ]);

    res.json({
      channelRowsImported: channelRows.length,
      weekdayRowsImported: dataset.weekday.length,
      missingFranchises: Array.from(missingNames),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error en import 2026' });
  }
});

// ── POST /api/sales/sync-sheet ─────────────────────────────
// Sincroniza SalesByChannel desde el Google Sheet fuente. Solo SUPERADMIN.
// Config: env SALES_SHEET_ID (id del spreadsheet) + GOOGLE_SA_KEY_JSON
// (credenciales del service account). Los tabs están hardcodeados porque
// dependen del layout del sheet — si cambian, se edita acá y se redeploy.
//
// El sheet es un PIVOT: locales en filas (con una fila de "encabezado de
// local" que solo tiene el nombre), canales anidados debajo, meses en
// columnas (pares [valor, variación %] — solo se lee la 1ra col de cada par).

const SHEET_TABS = {
  // Tab "Base pedidos x canal" — 1 fila por (local, mes), con orders y
  // revenue por cada canal en columnas paralelas. Fuente de verdad para
  // SalesByChannel (todos los locales de la red).
  baseChannels: 'Base pedidos x canal',
  // Tab "Análisis Jiro" — totales agregados de red por mes (para KPIs).
  monthlyTotal: 'Análisis Jiro',
} as const;

// Mapping de nombres de canal del sheet → canales canónicos del schema.
// - "WhatsApp" del sheet corresponde al canal "Local" en nuestra DB.
// - "Nucleo" del sheet es el TOTAL del local (suma de todos los canales) —
//   se ignora para no duplicar la facturación.
const SHEET_TO_CANONICAL_CHANNEL: Record<string, string> = {
  'Rappi Turbo': 'Rappi Turbo',
  'Rappi': 'Rappi',
  'Rappi veggie': 'Rappi Veggie',
  'Más delivery': 'Mas delivery',
  'Pedidos Ya': 'Pedidos Ya',
  'Mercado Pago': 'Mercado Pago',
  'Mercado Pago Veggie': 'Mercado Pago Veggie',
  'WhatsApp': 'Local',
};

// Parsea un valor tipo " $1.076.090" → 1076090. También acepta ints/floats
// crudos (por si el sheet cambia el formato).
function parsePivotValue(raw: string | undefined | null): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (!s || s === '-') return 0;
  // Quita $, espacios y separadores de miles (puntos). Coma como decimal.
  const clean = s.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Devuelve el año 4 dígitos vigente del sheet. Los meses vienen numerados
// 1-12 y el sheet no incluye el año en cada columna, así que asumimos el
// año actual (el sheet se llama "Distribución de venta 2026"). Configurable
// vía env SALES_SHEET_YEAR si en algún momento hay que sincronizar histórico.
function resolveSheetYear(): string {
  const envYear = process.env.SALES_SHEET_YEAR;
  if (envYear && /^\d{4}$/.test(envYear)) return envYear;
  return String(new Date().getFullYear());
}

// Parser del tab "Base pedidos x canal". Layout limpio, tabular:
//   fila 1: headers → "Mes","Mes#","Local","Rappi Turbo","Rappi",..."WhatsApp","Nucleo",
//                     "Rappi Turbo $","Rappi $",..."WhatsApp $","Nucleo $","Ticket..."
//   fila 2+: cada fila = { mes, mes#, local, ...orders por canal, ...revenue $ por canal, ...tickets }
//
// Devuelve array de {local, monthNum, channel(canonical), orders, revenue}.
// Los canales sin mapping en SHEET_TO_CANONICAL_CHANNEL se ignoran
// (ej. "Nucleo" que es el total del local).
function parseBaseChannelsTab(rows: string[][]): Array<{ local: string; monthNum: number; channel: string; orders: number; revenue: number }> {
  const out: Array<{ local: string; monthNum: number; channel: string; orders: number; revenue: number }> = [];
  if (rows.length < 2) return out;
  const headers = rows[0].map((h) => String(h || '').trim());

  // Descubrir columnas por canal: para cada canal del mapping, encontramos su
  // col de orders (header exact match) y su col de revenue (header + " $").
  const channelCols: Array<{ ordersCol: number; revenueCol: number; canonical: string }> = [];
  for (const [sheetName, canonical] of Object.entries(SHEET_TO_CANONICAL_CHANNEL)) {
    const ordersCol = headers.indexOf(sheetName);
    const revenueCol = headers.indexOf(`${sheetName} $`);
    if (ordersCol >= 0 && revenueCol >= 0) {
      channelCols.push({ ordersCol, revenueCol, canonical });
    }
  }
  const localCol = headers.indexOf('Local');
  const monthCol = headers.indexOf('Mes#');
  if (localCol < 0 || monthCol < 0 || channelCols.length === 0) return out;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const local = String(row[localCol] || '').trim();
    if (!local) continue;
    const monthNum = Number(String(row[monthCol] || '').trim());
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) continue;
    for (const { ordersCol, revenueCol, canonical } of channelCols) {
      const orders = Number(String(row[ordersCol] || '').replace(/[.\s]/g, '')) || 0;
      const revenue = parsePivotValue(row[revenueCol]);
      // Guardamos incluso los ceros para que se sobreescriban valores viejos.
      out.push({ local, monthNum, channel: canonical, orders, revenue });
    }
  }
  return out;
}

// Parser legacy del pivot — se dejaba de un tab que solo tenía 2 locales.
// Reemplazado por parseBaseChannelsTab. Se mantiene la firma por si alguien
// vuelve a usarlo, pero el sync-sheet ya no lo llama.
function parsePivotTab(rows: string[][]): Array<{ local: string; monthNum: number; channel: string; value: number }> {
  const out: Array<{ local: string; monthNum: number; channel: string; value: number }> = [];
  let currentLocal = '';
  let monthCols: Array<{ col: number; monthNum: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const firstCell = String(row[0] || '').trim();

    // Fila con col A vacía. Puede ser (a) totalmente vacía → skip normal, o
    // (b) una etiqueta de sub-sección analítica del sheet (tipo "Promedio
    // locales Jiro", "Monte Grande vs Adrogue", etc.) que tiene texto en
    // cols B+. En (b) reseteamos currentLocal para NO acumular los valores
    // del bloque siguiente en el último local real.
    if (!firstCell) {
      const anyText = row.some((c) => String(c || '').trim() !== '');
      if (anyText) currentLocal = '';
      continue;
    }

    const firstLower = firstCell.toLowerCase();

    // Header "Canal": actualizar mapping mes → col.
    if (firstLower === 'canal') {
      const newCols: Array<{ col: number; monthNum: number }> = [];
      for (let c = 1; c < row.length; c++) {
        const v = String(row[c] || '').trim();
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1 && n <= 12) newCols.push({ col: c, monthNum: n });
      }
      if (newCols.length > 0) monthCols = newCols;
      continue;
    }

    // Subtotal por local — skip.
    if (firstLower === 'total') continue;

    // ¿Esta fila tiene valores $ en las cols de mes?
    let hasDollarValue = false;
    let hasPercentValue = false;
    for (const { col } of monthCols) {
      const cell = String(row[col] || '').trim();
      if (cell.includes('$')) { hasDollarValue = true; break; }
      if (cell.includes('%')) hasPercentValue = true;
    }

    if (!hasDollarValue) {
      // Sin valores $: puede ser (a) nombre de local (fila que abre nueva
      // sección, posiblemente con texto descriptivo en col B), o (b) fila
      // del bloque de variación % (valores tipo "-70%"). Si NINGUNA col de
      // mes tiene "%", asumimos que es un nombre de local — así detectamos
      // filas como ["Adrogue", "Facturación mensuales | Adrogue"] donde
      // col B tiene texto pero cols de mes están vacías.
      if (!hasPercentValue) currentLocal = firstCell;
      continue;
    }

    // Fila de canal con valores $.
    if (!currentLocal || monthCols.length === 0) continue;
    const channel = firstCell; // sin trim — respetamos exact case + espacios
    for (const { col, monthNum } of monthCols) {
      const value = parsePivotValue(row[col]);
      out.push({ local: currentLocal, monthNum, channel, value });
    }
  }

  return out;
}

// Parser del tab "Análisis Jiro" — devuelve los totales agregados por mes.
// Layout:
//   Filas 6-17: cada fila es un mes de la red completa. Cols relevantes:
//     - col 5: número de mes (1-12) — a veces string, a veces number
//     - col 6: pedidos totales del mes
//     - col 7: facturación total del mes (con "$")
// El resto del tab tiene bloques por canal, evolución %, etc. — se ignoran.
function parseAnalisisJiroTab(rows: string[][]): Array<{ monthNum: number; orders: number; revenue: number }> {
  const out: Array<{ monthNum: number; orders: number; revenue: number }> = [];
  // Recorremos las primeras 20 filas — los totales están cerca del principio.
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i] || [];
    const monthCell = String(row[5] ?? '').trim();
    const monthNum = Number(monthCell);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) continue;
    const ordersCell = String(row[6] ?? '').trim();
    const revenueCell = String(row[7] ?? '').trim();
    // Necesitamos que la fila de facturación tenga "$" para saber que es el
    // bloque correcto (no una fila con "1","2","3" del header de canales).
    if (!revenueCell.includes('$')) continue;
    const orders = Number(ordersCell.replace(/[.\s]/g, '')) || 0;
    const revenue = parsePivotValue(revenueCell);
    out.push({ monthNum, orders, revenue });
  }
  return out;
}

// ── Recompute alertas ─────────────────────────────────────
// Se llama después del sync. Calcula 2 tipos de alerta para el `periodo`
// dado, hace upsert de las que corresponden y borra las que ya no aplican
// (excepto si están dismissed=true, que quedan en histórico).
const LOW_TICKET_RATIO = 0.7; // 30% por debajo del promedio de red
const LOCAL_CHANNEL = 'Local';

export async function computeSalesAlerts(periodo: string): Promise<{ upserted: number; deleted: number; skippedDismissed: number }> {
  // Traer todas las ventas del período agrupadas por franquicia.
  const rows = await prisma.salesByChannel.findMany({
    where: { periodo },
    select: { franchiseId: true, channel: true, orders: true, revenue: true },
  });
  if (rows.length === 0) return { upserted: 0, deleted: 0, skippedDismissed: 0 };

  // Agrupar por franchise: (revenue local, revenue otros, orders totales, revenue totales).
  type Agg = { localRev: number; othersRev: number; totalRev: number; totalOrders: number };
  const byFranchise = new Map<string, Agg>();
  let networkRev = 0;
  let networkOrders = 0;
  for (const r of rows) {
    const a = byFranchise.get(r.franchiseId) || { localRev: 0, othersRev: 0, totalRev: 0, totalOrders: 0 };
    if (r.channel === LOCAL_CHANNEL) a.localRev += r.revenue;
    else a.othersRev += r.revenue;
    a.totalRev += r.revenue;
    a.totalOrders += r.orders;
    byFranchise.set(r.franchiseId, a);
    networkRev += r.revenue;
    networkOrders += r.orders;
  }
  const networkTicket = networkOrders > 0 ? networkRev / networkOrders : 0;

  // Construir el set de alertas que deben existir.
  type Trigger = { type: string; franchiseId: string; localRevenue?: number; othersRevenue?: number; ticketLocal?: number; ticketNetwork?: number };
  const triggers: Trigger[] = [];
  for (const [franchiseId, a] of byFranchise.entries()) {
    // Solo tiene sentido si el local tuvo actividad en el mes.
    if (a.totalRev <= 0) continue;

    // 1) Canal "Local" (WhatsApp) por debajo de la suma del resto.
    //    Requerimos que exista actividad en "otros" > 0, si no la alerta
    //    no aplica (todos los canales del local están en 0).
    if (a.othersRev > 0 && a.localRev < a.othersRev) {
      triggers.push({
        type: 'local_channel_underperform',
        franchiseId,
        localRevenue: a.localRev,
        othersRevenue: a.othersRev,
      });
    }

    // 2) Ticket promedio muy por debajo del promedio de red.
    if (networkTicket > 0 && a.totalOrders > 0) {
      const ticketLocal = a.totalRev / a.totalOrders;
      if (ticketLocal < networkTicket * LOW_TICKET_RATIO) {
        triggers.push({
          type: 'low_ticket',
          franchiseId,
          ticketLocal,
          ticketNetwork: networkTicket,
        });
      }
    }
  }

  // Reconciliar contra las alertas existentes del período.
  const existing = await prisma.salesAlert.findMany({ where: { periodo } });
  const existingKey = new Map(existing.map((a) => [`${a.type}|${a.franchiseId}`, a]));
  const triggerKeys = new Set(triggers.map((t) => `${t.type}|${t.franchiseId}`));

  let upserted = 0;
  let deleted = 0;
  let skippedDismissed = 0;

  // Upsert cada trigger nuevo / actualizar valores de los existentes.
  for (const t of triggers) {
    const k = `${t.type}|${t.franchiseId}`;
    const prev = existingKey.get(k);
    if (prev?.dismissed) { skippedDismissed++; continue; }
    await prisma.salesAlert.upsert({
      where: { type_franchiseId_periodo: { type: t.type, franchiseId: t.franchiseId, periodo } },
      create: {
        type: t.type,
        franchiseId: t.franchiseId,
        periodo,
        localRevenue: t.localRevenue,
        othersRevenue: t.othersRevenue,
        ticketLocal: t.ticketLocal,
        ticketNetwork: t.ticketNetwork,
      },
      update: {
        localRevenue: t.localRevenue,
        othersRevenue: t.othersRevenue,
        ticketLocal: t.ticketLocal,
        ticketNetwork: t.ticketNetwork,
      },
    });
    upserted++;
  }

  // Borrar alertas del período que YA NO SE CUMPLEN (excepto dismissed:
  // dismissed queda como histórico así el user ve que la resolvió).
  for (const a of existing) {
    const k = `${a.type}|${a.franchiseId}`;
    if (!triggerKeys.has(k) && !a.dismissed) {
      await prisma.salesAlert.delete({ where: { id: a.id } });
      deleted++;
    }
  }

  return { upserted, deleted, skippedDismissed };
}

// GET /api/sales/alerts?active=1 (default 1) → alertas no dismissed.
// ?all=1 → incluye dismissed. ?periodo=YYYY-MM → filtra por período.
router.get('/alerts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const includeAll = req.query.all === '1';
    const periodo = typeof req.query.periodo === 'string' ? req.query.periodo : undefined;
    const where: Record<string, unknown> = {};
    if (!includeAll) where.dismissed = false;
    if (periodo) where.periodo = periodo;
    const alerts = await prisma.salesAlert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: { franchise: { select: { id: true, name: true } } },
    });
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al listar alertas' });
  }
});

// PATCH /api/sales/alerts/:id/dismiss → marca dismissed.
router.patch('/alerts/:id/dismiss', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await prisma.salesAlert.update({
      where: { id: req.params.id as string },
      data: { dismissed: true, dismissedAt: new Date(), dismissedBy: req.userId || null },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al descartar la alerta' });
  }
});

router.post('/sync-sheet', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    const spreadsheetId = process.env.SALES_SHEET_ID;
    if (!spreadsheetId) {
      res.status(500).json({ error: 'Falta env SALES_SHEET_ID' });
      return;
    }

    const [baseRows, jiroRows] = await Promise.all([
      readSheet(spreadsheetId, SHEET_TABS.baseChannels),
      readSheet(spreadsheetId, SHEET_TABS.monthlyTotal),
    ]);

    const baseParsed = parseBaseChannelsTab(baseRows);
    const monthlyTotalsParsed = parseAnalisisJiroTab(jiroRows);

    const year = resolveSheetYear();
    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });

    const missingFranchises = new Set<string>();

    // Resolver local → franchiseId por cada fila del tab "Base pedidos x canal".
    const finalRows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];
    for (const r of baseParsed) {
      const fid = matchFranchiseId(r.local, franchises);
      if (!fid) { missingFranchises.add(r.local); continue; }
      finalRows.push({
        franchiseId: fid,
        periodo: `${year}-${String(r.monthNum).padStart(2, '0')}`,
        channel: r.channel,
        orders: r.orders,
        revenue: r.revenue,
      });
    }

    // Upsert en lotes (Prisma no tiene upsertMany nativo).
    for (const r of finalRows) {
      await prisma.salesByChannel.upsert({
        where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
        create: r,
        update: { orders: r.orders, revenue: r.revenue },
      });
    }

    // Upsertear totales agregados de red del tab "Análisis Jiro".
    let monthlyTotalsUpserted = 0;
    for (const t of monthlyTotalsParsed) {
      const periodo = `${year}-${String(t.monthNum).padStart(2, '0')}`;
      await prisma.salesMonthlyTotal.upsert({
        where: { periodo },
        create: { periodo, orders: t.orders, revenue: t.revenue },
        update: { orders: t.orders, revenue: t.revenue },
      });
      monthlyTotalsUpserted++;
    }

    // Recalcular alertas para todos los períodos que trajimos.
    const periodosSync = Array.from(new Set(finalRows.map((r) => r.periodo)));
    let alertsUpserted = 0;
    let alertsDeleted = 0;
    for (const p of periodosSync) {
      const r = await computeSalesAlerts(p);
      alertsUpserted += r.upserted;
      alertsDeleted += r.deleted;
    }

    res.json({
      tabsProcessed: Object.values(SHEET_TABS),
      channelRowsUpserted: finalRows.length,
      monthlyTotalsUpserted,
      alertsUpserted,
      alertsDeleted,
      missingFranchises: Array.from(missingFranchises),
      note: 'SalesWeekday no se sincroniza desde el sheet (queda igual — se llena con el JSON de import o CSV upload).',
    });
  } catch (err: any) {
    console.error('[sales] sync-sheet error:', err);
    res.status(500).json({ error: err?.message || 'Error al sincronizar con Google Sheets' });
  }
});

// ── POST /api/sales/ask ────────────────────────────────────
// Asistente conversacional que responde preguntas sobre las ventas.
// Arma un snapshot compacto de SalesByChannel + SalesMonthlyTotal + franchises
// y lo pasa como system context a Claude para que responda.
// Body: { question: string, history?: [{role, content}] }
router.post('/ask', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' }); return; }

    const question = String(req.body?.question || '').trim();
    if (!question) { res.status(400).json({ error: 'Falta question' }); return; }
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    // Snapshot: últimos 15 meses de data por canal + totales por mes + franquicias.
    const [byChannel, monthlyTotals, franchises] = await Promise.all([
      prisma.salesByChannel.findMany({
        orderBy: [{ periodo: 'desc' }, { franchiseId: 'asc' }, { channel: 'asc' }],
        take: 5000, // hard cap defensivo
        select: { franchiseId: true, periodo: true, channel: true, orders: true, revenue: true },
      }),
      prisma.salesMonthlyTotal.findMany({ orderBy: { periodo: 'desc' }, take: 24 }),
      prisma.franchise.findMany({
        where: { active: true },
        select: { id: true, name: true, zona: true, barrio: true, city: true },
      }),
    ]);

    // Formato compacto para no explotar el contexto:
    // Franquicias: [id, nombre_limpio, zona, ciudad]
    // Sales:       [periodo, franchiseId, canal, orders, revenue_int]
    const franchisesLite = franchises.map((f) => ({
      id: f.id,
      name: f.name.replace(/^Jiro\s*Sushi\s*/i, '').trim(),
      zona: f.zona || null,
      city: f.city || null,
    }));
    const salesLite = byChannel.map((s) => [s.periodo, s.franchiseId, s.channel, s.orders, Math.round(s.revenue)]);
    const totalsLite = monthlyTotals.map((t) => [t.periodo, t.orders, Math.round(t.revenue)]);

    const today = new Date();
    const yyyymm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const systemPrompt = `Sos un analista de ventas de JIRO Sushi, una red de franquicias de sushi en Argentina.
El usuario te va a hacer preguntas sobre las ventas. Respondé SIEMPRE con números específicos
del snapshot de datos que te doy abajo. Sé conciso, directo y accionable. Usá el nombre del
LOCAL (no el franchiseId) en las respuestas. Todos los montos son en pesos argentinos (ARS).
La fecha de hoy es ${today.toISOString().slice(0, 10)} y el período actual es ${yyyymm}.

Canales que existen: Local (histórico "WhatsApp" en el sheet fuente), Rappi, Rappi Turbo,
Rappi Veggie, Pedidos Ya, Mas delivery, Mercado Pago, Mercado Pago Veggie.

Datos:

FRANQUICIAS (id → info):
${JSON.stringify(franchisesLite)}

TOTALES DE RED POR MES [periodo, orders, revenue]:
${JSON.stringify(totalsLite)}

VENTAS POR (LOCAL, MES, CANAL) [periodo, franchiseId, canal, orders, revenue]:
${JSON.stringify(salesLite)}

Reglas:
- Cuando decís un monto, formatealo tipo "$1.234.567" con puntos como separador de miles.
- Cuando referís a un local, usá su name (buscá el id en la tabla de franquicias).
- Si te preguntan por "caída de X meses", compará mes actual con X meses atrás y mostrá el %.
- Si un local tiene revenue=0 en un canal en un mes, mencionalo explícitamente si viene al caso.
- Sugerí acciones concretas cuando puedas ("este local podría reactivar Rappi porque su categoría muestra…").
- No inventes datos que no estén en el snapshot. Si te falta info, decilo.`;

    const messages = [
      ...history.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
      { role: 'user', content: question },
    ];

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json({ error: data?.error?.message || 'Error consultando Claude' });
      return;
    }
    const answer = Array.isArray(data.content)
      ? data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
      : '';
    res.json({
      answer,
      usage: data.usage,
      stats: {
        franchisesInContext: franchises.length,
        salesRowsInContext: byChannel.length,
        monthsInContext: monthlyTotals.length,
      },
    });
  } catch (err: any) {
    console.error('[sales] ask error:', err);
    res.status(500).json({ error: err?.message || 'Error al procesar la pregunta' });
  }
});

export default router;
