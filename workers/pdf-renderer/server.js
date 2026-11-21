import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 3400);
const SECRET = process.env.PDF_RENDERER_SECRET || '';
const MAX_BODY = 3 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;
const MAX_CONCURRENT = 2;
let inFlight = 0;
let browserPromise;

export function authorized(header, secret = SECRET) {
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function isSafeHtml(html) {
  if (typeof html !== 'string' || html.length < 20 || Buffer.byteLength(html, 'utf8') > MAX_BODY) return false;
  if (!/<html[\s>]/i.test(html) || !/<\/html\s*>/i.test(html)) return false;
  if (/<script\b|\son[a-z]+\s*=|javascript\s*:|url\(\s*['"]?https?:|@import/i.test(html)) return false;
  return true;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

function send(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }).catch((error) => {
      browserPromise = undefined;
      throw error;
    });
  }
  return browserPromise;
}

async function renderPdf(input) {
  if (!isSafeHtml(input.html)) throw Object.assign(new Error('The document HTML is invalid or contains active content'), { status: 400 });
  if (!['A4', 'wide'].includes(input.pageSize)) throw Object.assign(new Error('Unsupported page size'), { status: 400 });
  if (!['English', 'Urdu', 'Roman Urdu'].includes(input.language)) throw Object.assign(new Error('Unsupported document language'), { status: 400 });

  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false, acceptDownloads: false });
  try {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http:') || url.startsWith('https:')) return route.abort('blockedbyclient');
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.setContent(input.html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => { await document.fonts.ready; });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: input.pageSize === 'A4',
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width:100%;padding:0 16mm;color:#68786f;font-size:8px;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span> · Ilm AI</div>',
      margin: input.pageSize === 'wide'
        ? { top: '0', right: '0', bottom: '0', left: '0' }
        : { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
      tagged: true,
    });
    if (pdf.byteLength < 500 || pdf.byteLength > MAX_PDF) throw new Error('Rendered document is outside the PDF size limit');
    return Buffer.from(pdf);
  } finally {
    await context.close().catch(() => undefined);
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { ok: true, service: 'ilmai-pdf-renderer' });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/render') {
    send(res, 404, { error: 'Not found' });
    return;
  }
  if (!authorized(req.headers.authorization)) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }
  if (inFlight >= MAX_CONCURRENT) {
    send(res, 429, { error: 'PDF renderer is busy. Retry shortly.' });
    return;
  }
  inFlight++;
  try {
    const input = await readJson(req);
    const pdf = await renderPdf(input);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(pdf);
  } catch (error) {
    const status = Number(error?.status) || 500;
    send(res, status, { error: status >= 500 ? 'PDF rendering failed' : error.message });
  } finally {
    inFlight--;
  }
});

if (process.env.PDF_RENDERER_START === '1' || import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!SECRET) {
    console.error('PDF_RENDERER_SECRET must be configured');
    process.exit(1);
  }
  server.listen(PORT, '0.0.0.0', () => console.log('Ilm AI PDF renderer listening on ' + PORT));
}

export { server, renderPdf };
