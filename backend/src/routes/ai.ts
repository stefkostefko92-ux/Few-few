import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const router = Router();

// Letti a runtime (non a import-time) così /api/ai/save-config ha effetto immediato
const getAIConfig = () => ({
  provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
  geminiKey: process.env.GEMINI_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
});

const SYSTEM_PROMPT = `Sei l'assistente AI di ERP Ascensori Enterprise, un gestionale per aziende di manutenzione e installazione impianti elevatori in Italia.

Il tuo ruolo è generare testi professionali per:
- Descrizioni tecniche di impianti elevatori
- Testi per preventivi e offerte commerciali
- Motivazioni per cartelli "fuori servizio"
- Verbali di chiusura cantiere
- Note tecniche e annotazioni
- Qualsiasi campo testuale del sistema

Regole:
- Rispondi SEMPRE in italiano
- Usa terminologia tecnica del settore ascensoristico
- Sii preciso, professionale e conciso
- Quando generi documenti, usa il formato appropriato con intestazioni
- Includi riferimenti normativi quando pertinente (DPR 162/99, Dir. 2014/33/UE)
- Non inventare numeri di matricola o dati specifici, usa segnaposto [MATRICOLA], [DATA] ecc.`;

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Tipi di file supportati per la lettura documenti
const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
]);

interface DocumentPart {
  base64: string;
  mimeType: string;
}

async function callGemini(messages: AIMessage[], document?: DocumentPart, jsonMode = false, _isRetry = false): Promise<string> {
  const { geminiKey, geminiModel } = getAIConfig();
  const contents = messages
    .filter(m => m.role !== 'system')
    .map((m, idx) => {
      const parts: any[] = [];
      // Allega il documento al primo messaggio utente
      if (document && idx === 0 && m.role === 'user') {
        parts.push({ inline_data: { mime_type: document.mimeType, data: document.base64 } });
      }
      parts.push({ text: m.content });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
  // Gemini richiede che la conversazione inizi con un turno utente
  while (contents.length && contents[0].role === 'model') contents.shift();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: jsonMode ? 0.1 : 0.7,
          maxOutputTokens: 4096,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 429) {
      // Piano free: un retry automatico dopo una breve attesa prima di arrendersi
      if (!_isRetry) {
        await new Promise(r => setTimeout(r, 5000));
        return callGemini(messages, document, jsonMode, true);
      }
      throw new Error('Limite gratuito Gemini raggiunto. Attendi un minuto e riprova (il piano free ha un numero limitato di richieste al minuto).');
    }
    if (response.status === 400 && error.includes('API key')) {
      throw new Error('API key Gemini non valida. Genera una key gratuita su aistudio.google.com/apikey');
    }
    throw new Error(`Gemini API error: ${response.status} - ${error.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || '')
    .join('') || '';
  return text || 'Nessuna risposta generata.';
}

async function callAnthropic(messages: AIMessage[], document?: DocumentPart): Promise<string> {
  const { anthropicKey } = getAIConfig();
  const apiMessages = messages
    .filter(m => m.role !== 'system')
    .map((m, idx) => {
      if (document && idx === 0 && m.role === 'user') {
        const docBlock = document.mimeType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: document.mimeType, data: document.base64 } }
          : { type: 'image', source: { type: 'base64', media_type: document.mimeType, data: document.base64 } };
        return { role: m.role, content: [docBlock, { type: 'text', text: m.content }] };
      }
      return { role: m.role, content: m.content };
    });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error.slice(0, 300)}`);
  }

  const data: any = await response.json();
  return data.content?.[0]?.text || 'Nessuna risposta generata.';
}

async function callOpenAI(messages: AIMessage[], document?: DocumentPart): Promise<string> {
  const { openaiKey } = getAIConfig();
  if (document && document.mimeType === 'application/pdf') {
    throw new Error('La lettura PDF non è supportata con OpenAI. Usa il provider Gemini (gratuito) per leggere i PDF.');
  }
  const apiMessages = messages
    .filter(m => m.role !== 'system')
    .map((m, idx) => {
      if (document && idx === 0 && m.role === 'user') {
        return {
          role: m.role,
          content: [
            { type: 'image_url', image_url: { url: `data:${document.mimeType};base64,${document.base64}` } },
            { type: 'text', text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...apiMessages],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error.slice(0, 300)}`);
  }

  const data: any = await response.json();
  return data.choices?.[0]?.message?.content || 'Nessuna risposta generata.';
}

function checkProviderConfigured(res: Response): boolean {
  const { provider, geminiKey, anthropicKey, openaiKey } = getAIConfig();
  if (provider === 'gemini' && !geminiKey) {
    res.status(503).json({ error: 'API key Gemini non configurata. Genera una key GRATUITA su aistudio.google.com/apikey e inseriscila in Impostazioni → Configurazione AI (oppure GEMINI_API_KEY nel file .env).' });
    return false;
  }
  if (provider === 'anthropic' && !anthropicKey) {
    res.status(503).json({ error: 'API key Anthropic non configurata. Configura ANTHROPIC_API_KEY nel file .env' });
    return false;
  }
  if (provider === 'openai' && !openaiKey) {
    res.status(503).json({ error: 'API key OpenAI non configurata. Configura OPENAI_API_KEY nel file .env' });
    return false;
  }
  return true;
}

async function callProvider(messages: AIMessage[], document?: DocumentPart, jsonMode = false): Promise<string> {
  const { provider } = getAIConfig();
  if (provider === 'anthropic') return callAnthropic(messages, document);
  if (provider === 'openai') return callOpenAI(messages, document);
  return callGemini(messages, document, jsonMode);
}

// Estrae un oggetto JSON dalla risposta del modello (tollera testo extra e code fence)
function parseJSONResponse(text: string): Record<string, any> {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Risposta AI non in formato JSON valido');
  }
}

function parseJSONArrayResponse(text: string): Record<string, any>[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    return [parseJSONResponse(cleaned)];
  }
}

// POST /api/ai/extract — Legge un documento (PDF/immagine/CSV) e compila i campi
router.post('/extract', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fileBase64, mimeType, fileName, fields, entity, multi } = req.body;

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      res.status(400).json({ error: 'File richiesto (fileBase64)' });
      return;
    }
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      res.status(400).json({ error: 'Definizione campi richiesta (fields)' });
      return;
    }
    // ~14 MB binari = ~19 MB base64
    if (fileBase64.length > 19 * 1024 * 1024) {
      res.status(413).json({ error: 'File troppo grande (max 14 MB)' });
      return;
    }
    const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
    if (!DOC_MIME_TYPES.has(mime) && !TEXT_MIME_TYPES.has(mime)) {
      res.status(415).json({ error: `Tipo file non supportato: ${mime || 'sconosciuto'}. Usa PDF, immagini (PNG/JPG/WEBP), CSV o testo.` });
      return;
    }
    if (!checkProviderConfigured(res)) return;

    const fieldLines = fields.map((f: any) => {
      let line = `- "${f.key}": ${f.label || f.key}`;
      if (f.type === 'select' && Array.isArray(f.options) && f.options.length) {
        line += ` [valori ammessi: ${f.options.join(', ')}]`;
      } else if (f.type === 'number') {
        line += ' [numero]';
      } else if (f.type === 'date') {
        line += ' [data, formato YYYY-MM-DD]';
      } else if (f.type === 'checkbox') {
        line += ' [booleano true/false]';
      }
      return line;
    }).join('\n');

    const formatRules = `- Includi solo i campi di cui trovi l'informazione nel documento: NON inventare dati.
- Date sempre in formato YYYY-MM-DD. Numeri come numeri JSON (senza simboli di valuta).
- Per i campi con valori ammessi, scegli solo uno dei valori elencati.`;

    const prompt = multi
      ? `Analizza il documento allegato${fileName ? ` ("${fileName}")` : ''} ed estrai TUTTI i record per il modulo "${entity || 'anagrafica'}".

Campi di ogni record:
${fieldLines}

Istruzioni:
- Rispondi SOLO con un ARRAY JSON valido di oggetti, le cui chiavi sono esattamente i "key" elencati sopra.
${formatRules}
- Un elemento dell'array per ogni record/riga presente nel documento (max 100).`
      : `Analizza il documento allegato${fileName ? ` ("${fileName}")` : ''} ed estrai i valori per i campi del modulo "${entity || 'anagrafica'}".

Campi da compilare:
${fieldLines}

Istruzioni:
- Rispondi SOLO con un oggetto JSON valido le cui chiavi sono esattamente i "key" elencati sopra.
${formatRules}
- Se il documento contiene più record, estrai il primo/principale.`;

    let document: DocumentPart | undefined;
    let messages: AIMessage[];

    if (TEXT_MIME_TYPES.has(mime)) {
      // I file testuali vengono decodificati e inviati come testo: funziona con ogni provider
      const textContent = Buffer.from(fileBase64, 'base64').toString('utf-8').slice(0, 100_000);
      messages = [{ role: 'user', content: `Contenuto del documento:\n\n${textContent}\n\n${prompt}` }];
    } else {
      document = { base64: fileBase64, mimeType: mime };
      messages = [{ role: 'user', content: prompt }];
    }

    const responseText = await callProvider(messages, document, true);

    // Restituisce solo i campi richiesti, scartando chiavi estranee
    const allowedKeys = new Set(fields.map((f: any) => f.key));
    const pick = (obj: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (allowedKeys.has(k) && v !== null && v !== undefined && v !== '') out[k] = v;
      }
      return out;
    };

    let data: Record<string, any> = {};
    let records: Record<string, any>[] | undefined;
    if (multi) {
      const parsed = parseJSONArrayResponse(responseText);
      records = parsed.slice(0, 100).map(pick).filter(r => Object.keys(r).length > 0);
      data = records[0] || {};
    } else {
      data = pick(parseJSONResponse(responseText));
    }

    const { provider } = getAIConfig();
    await createAuditLog({
      azione: 'AI_EXTRACT',
      entita: entity || 'documento',
      dettagli: { fileName, mimeType: mime, fieldsExtracted: Object.keys(data).length, records: records?.length, provider },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.json({ data, records, provider, fileName });
  } catch (error: any) {
    console.error('AI extract error:', error.message);
    res.status(500).json({ error: `Errore lettura documento: ${error.message}` });
  }
});

// POST /api/ai/generate — Genera testo AI
router.post('/generate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, context, tipo } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt richiesto' });
      return;
    }
    if (!checkProviderConfigured(res)) return;

    let enrichedPrompt = prompt;
    if (context) {
      enrichedPrompt = `Contesto: ${JSON.stringify(context)}\n\nRichiesta: ${prompt}`;
    }
    if (tipo) {
      enrichedPrompt = `[Tipo documento: ${tipo}]\n${enrichedPrompt}`;
    }

    const responseText = await callProvider([{ role: 'user', content: enrichedPrompt }]);
    const { provider } = getAIConfig();

    await createAuditLog({
      azione: 'AI_GENERATE',
      entita: 'ai_assistant',
      dettagli: { tipo, promptLength: prompt.length, provider },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.json({
      testo: responseText,
      provider,
      tipo,
    });
  } catch (error: any) {
    console.error('AI generate error:', error.message);
    res.status(500).json({ error: `Errore AI: ${error.message}` });
  }
});

// POST /api/ai/chat — Chat multi-turno
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messages: chatMessages } = req.body;

    if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      res.status(400).json({ error: 'Messaggi richiesti' });
      return;
    }
    if (!checkProviderConfigured(res)) return;

    const responseText = await callProvider(chatMessages);
    const { provider } = getAIConfig();

    res.json({
      role: 'assistant',
      content: responseText,
      provider,
    });
  } catch (error: any) {
    console.error('AI chat error:', error.message);
    res.status(500).json({ error: `Errore AI: ${error.message}` });
  }
});

// GET /api/ai/templates — Template prompt predefiniti
router.get('/templates', authenticate, async (_req: AuthRequest, res: Response) => {
  res.json([
    {
      id: 'descrizione_impianto',
      nome: 'Descrizione Tecnica Impianto',
      prompt: 'Genera una descrizione tecnica professionale per un impianto elevatore con le seguenti caratteristiche: [inserisci marca, modello, portata, fermate, anno]',
      tipo: 'DESCRIZIONE',
    },
    {
      id: 'testo_preventivo',
      nome: 'Testo Preventivo',
      prompt: 'Genera il testo introduttivo per un preventivo di [tipo intervento] su impianto [marca/modello]. Includi: oggetto, premessa tecnica, ambito intervento.',
      tipo: 'PREVENTIVO',
    },
    {
      id: 'cartello_fuori_servizio',
      nome: 'Cartello Fuori Servizio',
      prompt: 'Genera il testo per un cartello "Impianto Fuori Servizio" con motivazione tecnica per: [descrivi il guasto o intervento in corso]',
      tipo: 'CARTELLO',
    },
    {
      id: 'verbale_cantiere',
      nome: 'Verbale Chiusura Cantiere',
      prompt: 'Genera un verbale di chiusura cantiere per l\'intervento [tipo intervento] sull\'impianto [matricola]. Includi: lavori eseguiti, esito prove, dichiarazione di conformità.',
      tipo: 'VERBALE',
    },
    {
      id: 'nota_tecnica',
      nome: 'Nota Tecnica',
      prompt: 'Genera una nota tecnica relativa a: [descrivi osservazione o anomalia riscontrata]',
      tipo: 'NOTA',
    },
    {
      id: 'offerta_manutenzione',
      nome: 'Offerta Contratto Manutenzione',
      prompt: 'Genera il testo per un\'offerta di contratto di manutenzione ordinaria annuale per [N] impianti. Includi: frequenza visite, attività incluse, condizioni.',
      tipo: 'OFFERTA',
    },
  ]);
});

// GET /api/ai/config — Config AI corrente
router.get('/config', authenticate, async (_req: AuthRequest, res: Response) => {
  const { provider, geminiKey, anthropicKey, openaiKey, geminiModel } = getAIConfig();
  res.json({
    provider,
    geminiConfigured: !!geminiKey,
    anthropicConfigured: !!anthropicKey,
    openaiConfigured: !!openaiKey,
    geminiModel,
  });
});

export default router;
