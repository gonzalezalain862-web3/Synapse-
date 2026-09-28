export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { historial, provider = 'openrouter', model = '', imagen = null } = req.body;
  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial' });
  }

  const systemPromptText = "Eres el asistente virtual de Synapse, una plataforma SaaS de automatizacion inteligente con IA y Web3. Tono amable, cercano y profesional. Responde de forma concisa (2-3 parrafos) y usa emojis ocasionalmente. IMPORTANTE: Detecta el idioma del usuario y responde SIEMPRE en ese mismo idioma (espanol, ingles, portugues, frances, etc.). Sobre Synapse: Es una DApp con chat IA disponible 24/7, usa Gemini y OpenRouter como motores de IA, permite integrar un widget de chat en cualquier sitio web, se conecta con HubSpot CRM para captura automatica de leads, acepta pagos con USDC en Polygon, es compatible con MetaMask, Trust Wallet y Coinbase Wallet, se integra con WhatsApp, Instagram y Facebook mediante Callbell, y es compatible con Google Ads, Facebook Ads, Instagram Ads, LinkedIn Ads y TikTok Ads. PLANES DISPONIBLES (informacion exacta, no inventes otros): 1) PLAN BASICO: $29/mes - 1 bot, 10.000 mensajes/mes, soporte por email. 2) PLAN PRO: $55/mes - 5 bots, 100.000 mensajes/mes, soporte prioritario y analytics. 3) PLAN ENTERPRISE: precio a consultar - bots ilimitados, API personalizada y soporte dedicado. CONTACTO: WhatsApp +58 412 2664528, Email: assistent.ai213@gmail.com. Instrucciones: Se conciso pero completo, evita respuestas roboticas, guia al usuario paso a paso si pregunta como usar algo.";

  try {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
      const modelFinal = model || 'gemini-3.6-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelFinal}:generateContent?key=${apiKey}`;
      const contents = historial.map((m, idx) => {
        const parts = [{ text: m.content }];
        if (idx === historial.length - 1 && imagen) {
          const base64Data = imagen.split(',')[1];
          const mimeType = imagen.split(';')[0].split(':')[1];
          parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
        }
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPromptText }] },
          contents: contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 800 }
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || `Error ${response.status}` });
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) return res.status(500).json({ error: 'Respuesta vacia de Gemini' });
      return res.status(200).json({ reply });
    }

    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada' });
      let mensajes;
      if (imagen) {
        const base64Data = imagen.split(',')[1];
        const mimeType = imagen.split(';')[0].split(':')[1];
        mensajes = [{ role: 'system', content: systemPromptText }, ...historial.slice(0, -1), {
          role: 'user',
          content: [
            { type: 'text', text: historial[historial.length - 1].content },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }];
      } else {
        mensajes = [{ role: 'system', content: systemPromptText }, ...historial];
      }
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    if (provider === 'groq') {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'XAI_API_KEY no configurada' });
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
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
