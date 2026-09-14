export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { historial, provider = 'openrouter', model = '' } = req.body;
  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial de la conversación' });
  }

  const systemPrompt = {
    role: "system",
    content: "Eres el asistente virtual de Synapse, una plataforma de automatización de atención al cliente con IA y Web3. Tu tono debe ser amable, cercano y profesional, como si hablaras con un amigo. Usa un lenguaje natural, sé conciso (máximo 2 o 3 párrafos por respuesta) y usa emojis ocasionalmente para ser más cálido. Tu objetivo es ayudar al usuario con dudas sobre la plataforma, sus servicios de IA, pagos con criptomonedas (USDC en Polygon) y configuración de burbujas de chat."
  };

  const mensajesParaEnviar = [systemPrompt, ...historial];

  try {
    let url, apiKey, modelFinal;

    if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      apiKey = process.env.OPENROUTER_API_KEY;
      modelFinal = model || 'openrouter/free';
    } else if (provider === 'groq') {
      url = 'https://api.x.ai/v1/chat/completions';
      apiKey = process.env.XAI_API_KEY;
      modelFinal = model || 'grok-beta';
    } else if (provider === 'github') {
      url = 'https://models.inference.ai.azure.com/chat/completions';
      apiKey = process.env.GITHUB_TOKEN;
      modelFinal = model || 'gpt-4o-mini';
    } else {
      return res.status(400).json({ error: 'Proveedor no soportado' });
    }

    if (!apiKey) return res.status(500).json({ error: `API Key de ${provider} no configurada` });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // Cabeceras especiales para OpenRouter
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://synapse-v3-alpha.vercel.app';
      headers['X-Title'] = 'Synapse AI';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelFinal,
        messages: mensajesParaEnviar,
        temperature: 0.85,
        max_tokens: 300
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || `Error ${response.status} de ${provider}` });
    }

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'Respuesta vacía del proveedor' });
    }

    return res.status(200).json({ reply: data.choices[0].message.content });

  } catch (error) {
    console.error('Error en backend:', error);
    return res.status(500).json({ error: error.message || 'Error desconocido' });
  }
}
