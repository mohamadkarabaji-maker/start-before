import 'dotenv/config';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_BODY = 30_000;

const server = http.createServer(async (req, res) => {
  const setHeaders = () => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
  };
  setHeaders();

  if (req.method === 'POST' && req.url === '/api/analyze') {
    if (!API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'مفتاح OPENAI_API_KEY غير مضبوط على الخادم.' }));
    }
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) throw new Error('حجم البيانات أكبر من المسموح.');
      }
      const data = JSON.parse(raw || '{}');
      const allowedLanguages = { ar: 'Arabic', fr: 'French', en: 'English' };
      if (!allowedLanguages[data.language] || typeof data.idea !== 'string' || data.idea.trim().length < 8 || data.idea.length > 5000) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'يرجى إدخال فكرة مشروع واضحة واختيار لغة صحيحة.' }));
      }
      if (!Number.isFinite(Number(data.budget)) || Number(data.budget) <= 0 || Number(data.budget) > 1_000_000_000) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'قيمة رأس المال غير صالحة.' }));
      }

      const language = allowedLanguages[data.language];
      const project = {
        idea: data.idea.trim(), country: String(data.country || '').slice(0, 100),
        city: String(data.city || '').slice(0, 120), budget: Number(data.budget),
        currency: 'USD', experience: String(data.experience || '').slice(0, 100),
        targetCustomer: String(data.customer || '').slice(0, 500), stage: String(data.stage || '').slice(0, 100)
      };
      const instructions = `You are START BEFORE, a careful early-stage business validation assistant. Respond entirely in ${language}. Create a practical, structured preliminary feasibility assessment for the user's business idea. Be specific to the provided inputs, but NEVER invent current market statistics, competitor names, supplier prices, laws, permits, or guaranteed outcomes. If reliable data is absent, clearly label estimates as assumptions and provide a concrete local validation method. Include: (1) concise verdict with confidence and reasons, (2) customer/problem/value proposition, (3) target market and demand hypotheses, (4) competitor/alternative research plan without fabricated names, (5) startup and monthly cost table with ranges only when defensible; otherwise show blank/unknown inputs and explain how to collect quotes, (6) conservative/base/optimistic unit-economics scenarios using explicitly stated assumptions and formulas, not unsupported certainty, (7) break-even formula and an illustrative calculation only if inputs allow, (8) top risks and mitigations, (9) a 30-day validation plan with weekly actions and measurable success criteria, (10) five critical questions for the founder. Distinguish revenue from profit. Mention taxes, permits, and local rules must be verified with official local sources. Do not present this as financial, legal, or investment advice. Be honest if the idea is weak or information is insufficient. Use readable headings and bullets.`;
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, instructions, input: `Analyze this project using the following user-provided information:\n${JSON.stringify(project, null, 2)}`, max_output_tokens: 3000 })
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result?.error?.message || `OpenAI API returned ${response.status}`;
        res.writeHead(response.status === 429 ? 429 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: message }));
      }
      const report = result.output_text || (result.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('\n');
      if (!report) throw new Error('لم يصل نص التقرير من نموذج الذكاء الاصطناعي.');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ report }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: error.message || 'حدث خطأ أثناء إنشاء التقرير.' }));
    }
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = await readFile(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500); return res.end('Could not load index.html');
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`START BEFORE is running at http://localhost:${PORT}`));
