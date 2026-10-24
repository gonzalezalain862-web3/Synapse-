export const config = { maxDuration: 60 };

async function fetchWithRetry(url, options, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        console.error(`[fetchWithRetry] Intento ${i + 1} fallido con estado ${response.status}. Reintentando en ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
      console.error(`[fetchWithRetry] Error de red en intento ${i + 1}: ${error.message}. Reintentando en ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Máximo de reintentos alcanzado');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { historial, provider = 'openrouter', model = '', imagen = null } = req.body;
  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial' });
  }

  const systemPromptText = "Eres el asistente virtual de Synapse, una plataforma SaaS de automatizacion inteligente con IA y Web3. Tono amable, cercano y profesional. Responde de forma concisa (2-3 parrafos) y usa emojis ocasionalmente. IMPORTANTE: Detecta el idioma del usuario y responde SIEMPRE en ese mismo idioma. Sobre Synapse: Es una DApp con chat IA disponible 24/7, usa Gemini y OpenRouter, permite integrar un widget de chat, se conecta con HubSpot CRM, acepta pagos con USDC en Polygon, se integra con WhatsApp, Instagram y Facebook mediante Callbell. PLANES: 1) BASICO $29/mes, 2) PRO $55/mes, 3) ENTERPRISE a consultar. CONTACTO: WhatsApp +58 412 2664528, Email: assistent.ai213@gmail.com.";

  try {
    // ============ GEMINI (STREAMING) ============
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

      const modelFinal = model || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelFinal}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const contents = historial.map((m, idx) => {
        const parts = [{ text: m.content }];
        if (idx === historial.length - 1 && imagen) {
          const base64Data = imagen.split(',')[1];
          const mimeType = imagen.split(';')[0].split(':')[1];
          parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
        }
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
      });

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPromptText }] },
          contents: contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 800 }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: `Error de Gemini: ${errText}` });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Escribir keep-alive inicial
      res.write(': keep-alive\n\n');

      const keepAliveInterval = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 10000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (error) {
        console.error('Error en streaming:', error);
      } finally {
        clearInterval(keepAliveInterval);
        res.end();
      }
      return;
    }

    // ============ OPENROUTER ============
    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada' });

      let mensajes = [{ role: 'system', content: systemPromptText }, ...historial];
      const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://synapse-v3-alpha.vercel.app',
          'X-Title': 'Synapse AI'
        },
        body: JSON.stringify({ model: model || 'openrouter/free', messages: mensajes, temperature: 0.85, max_tokens: 800 })
      });
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || `Error ${response.status}` });
      return res.status(200).json({ reply: data.choices[0].message.content });
    }

    // ============ GROK ============
    if (provider === 'groq') {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'XAI_API_KEY no configurada' });

      const response = await fetchWithRetry('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'grok-beta', messages: [{ role: 'system', content: systemPromptText }, ...historial], temperature: 0.85, max_tokens: 800 })
      });
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || `Error ${response.status}` });
      return res.status(200).json({ reply: data.choices[0].message.content });
    }

    return res.status(400).json({ error: 'Proveedor no soportado' });

  } catch (error) {
    console.error('Error en backend:', error);
    return res.status(500).json({ error: error.message || 'Error desconocido' });
  }
}
