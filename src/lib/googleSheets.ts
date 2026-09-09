import { google, sheets_v4 } from 'googleapis';

// Cliente Google Sheets autenticado con Service Account. Las credenciales
// vienen de la env `GOOGLE_SA_KEY_JSON` (el JSON completo del key en una
// sola línea). Se cachea el cliente para no re-parsear ni re-autenticar
// en cada request.
let cachedClient: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  const raw = process.env.GOOGLE_SA_KEY_JSON;
  if (!raw || !raw.trim()) {
    throw new Error('Falta env GOOGLE_SA_KEY_JSON (JSON del service account de Google)');
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SA_KEY_JSON no es un JSON válido');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

// Devuelve TODAS las celdas del tab pedido como matriz de strings.
// range: 'NombreDelTab' (para todo el tab) o 'NombreDelTab!A1:Z' etc.
export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (res.data.values || []) as string[][];
}

// Diagnóstico: lista los tabs (title + gid) del spreadsheet.
export async function listSheetTabs(spreadsheetId: string): Promise<Array<{ title: string; gid: number }>> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
  return (res.data.sheets || []).map((s) => ({
    title: s.properties?.title || '',
    gid: s.properties?.sheetId || 0,
  }));
}
