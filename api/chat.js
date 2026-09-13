export default async function handler(req, res) {
  // Cabeceras CORS obligatorias
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { historial, provider = 'openrouter', model = '' } = req.body;

  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial de la conversación' });
  }

  const systemPrompt = {
    role: "system",
    content: "Eres el asistente virtual de Synapse, una plataforma de automatización de atención al cliente con IA y Web3. Tu tono debe ser amable, cercano y profesional, como si hablaras con un amigo. Usa un lenguaje natural, sé conciso (máximo 2 o 3 párrafos por respuesta) y usa emojis ocasionalmente para ser más cálido. Evita sonar como un robot o usar jerga técnica innecesaria. Tu objetivo es ayudar al usuario con dudas sobre la plataforma, sus servicios de IA, pagos con criptomonedas (USDC en Polygon) y configuración de burbujas de chat. Si no sabes algo, discúlpate amablemente y ofrece contactar a soporte."
  };

  const mensajesParaEnviar = [systemPrompt, ...historial];

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada en Vercel' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://synapse-v3-alpha.vercel.app',
        'X-Title': 'Synapse AI'
      },
      body: JSON.stringify({
        model: model || 'meta-llama/llama-3.1-8b-instruct:free',
        messages: mensajesParaEnviar,
        temperature: 0.85,
        max_tokens: 300
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || `Error ${response.status} de OpenRouter` });
    }

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'Respuesta vacía de OpenRouter' });
    }

    return res.status(200).json({ reply: data.choices[0].message.content });

  } catch (error) {
    console.error('Error en backend:', error);
    return res.status(500).json({ error: error.message || 'Error desconocido' });
  }
}
