export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { historial, provider = 'openrouter', model = '' } = req.body;
  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial' });
  }

  const systemPromptText = "Eres el asistente virtual de Synapse, una plataforma de automatización con IA y Web3. Tono amable, cercano y profesional. Responde en español, sé conciso (2-3 párrafos) y usa emojis ocasionalmente. Ayuda con dudas sobre la plataforma, servicios de IA, pagos con criptomonedas (USDC en Polygon) y configuración de burbujas de chat.";

  try {
    // ============ GEMINI ============
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

      const modelFinal = model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelFinal}:generateContent?key=${apiKey}`;

      const contents = historial.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPromptText }] },
          contents: contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 300 }
        })
      });

      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || `Error ${response.status} de Gemini` });
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) return res.status(500).json({ error: 'Respuesta vacía de Gemini' });
      return res.status(200).json({ reply });
    }

    // ============ OPENROUTER ============
    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada' });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://synapse-v3-alpha.vercel.app',
          'X-Title': 'Synapse AI'
        },
        body: JSON.stringify({
          model: model || 'openrouter/free',
          messages: [{ role: 'system', content: systemPromptText }, ...historial],
          temperature: 0.85,
          max_tokens: 300
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(500).json({ error: data.error?.message || `Error ${response.status}` });
      return res.status(200).json({ reply: data.choices[0].message.content });
    }

    // ============ GROK / xAI ============
    if (provider === 'groq') {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'XAI_API_KEY no configurada' });

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'grok-beta',
          messages: [{ role: 'system', content: systemPromptText }, ...historial],
          temperature: 0.85,
          max_tokens: 300
        })
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
