export const config = { maxDuration: 60 };

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;
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

  const systemPromptText = "Eres el asistente virtual de Synapse. Tono amable, cercano y profesional. Responde de forma concisa (2-3 párrafos) y usa emojis ocasionalmente. IMPORTANTE: Detecta el idioma del usuario y responde SIEMPRE en ese mismo idioma. Sobre Synapse: Es una DApp con chat IA disponible 24/7, se conecta con HubSpot CRM, acepta pagos con USDC en Polygon, se integra con WhatsApp, Instagram y Facebook mediante Callbell. PLANES: 1) BASICO $29/mes, 2) PRO $55/mes, 3) ENTERPRISE a consultar. CONTACTO: WhatsApp +58 412 2664528, Email: assistent.ai213@gmail.com.";

  try {
    // ============ OPENROUTER (Con Failover a Gemini y Groq) ============
    if (provider === 'openrouter') {
      // 1. Intentar con Gemini primero
      if (model === 'gemini-1.5-flash' || model === 'gemini-3.8-flash') {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          const modelFinal = model || 'gemini-1.5-flash';
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelFinal}:streamGenerateContent?alt=sse&key=${apiKey}`;
          
          const contents = historial.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

          const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPromptText }] },
              contents: contents,
              generationConfig: { temperature: 0.85, maxOutputTokens: 800 }
            })
          });

          if (response.ok) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            
            res.write(encoder.encode(': keep-alive\n\n'));
            const keepAlive = setInterval(() => res.write(encoder.encode(': keep-alive\n\n')), 10000);
            
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(decoder.decode(value, { stream: true }));
              }
            } finally {
              clearInterval(keepAlive);
              res.end();
            }
            return;
          }
        } catch (e) {
          console.log("Gemini falló, intentando con Groq...");
        }
      }

      // 2. Intentar con Groq
      try {
        const groqKey = process.env.GROQ_API_KEY;
        const groqResponse = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model: 'llama-3.1-8b-instant', 
            messages: [{ role: 'system', content: systemPromptText }, ...historial],
            temperature: 0.85, max_tokens: 800 
          })
        });
        
        const groqData = await groqResponse.json();
        if (groqResponse.ok && groqData.choices) {
          return res.status(200).json({ reply: groqData.choices[0].message.content });
        }
      } catch (e) {
        console.log("Groq falló, intentando con OpenRouter...");
      }

      // 3. Intentar con OpenRouter (Último recurso)
      const apiKey = process.env.OPENROUTER_API_KEY;
      const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://synapse-v3-alpha.vercel.app',
          'X-Title': 'Synapse AI'
        },
        body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'system', content: systemPromptText }, ...historial], temperature: 0.85, max_tokens: 800 })
      });
      const data = await response.json();
      
      if (!response.ok) return res.status(500).json({ error: data.error?.message || "Todos los modelos gratuitos están saturados. Intenta de nuevo en unos minutos." });
      
      const reply = data.choices[0].message.content;
      if (reply.includes("User Safety")) {
        return res.status(200).json({ reply: "⚠️ El modelo gratuito bloqueó esta respuesta. Por favor, intenta con otro mensaje o espera un momento." });
      }
      return res.status(200).json({ reply });
    }

    // ============ GROK (xAI) ============
    if (provider === 'groq') {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'XAI_API_KEY no configurada' });

      const response = await fetchWithRetry('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'grok-4.7', messages: [{ role: 'system', content: systemPromptText }, ...historial], temperature: 0.85, max_tokens: 800 })
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
