export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Recibimos el historial completo de la conversación
  const { historial, provider = 'openrouter', model = '' } = req.body;
  
  if (!historial || !Array.isArray(historial)) {
    return res.status(400).json({ error: 'Falta el historial de la conversación' });
  }

  // System Prompt: Define la personalidad de Synapse
  const systemPrompt = {
    role: "system",
    content: "Eres el asistente virtual de Synapse, una plataforma de automatización de atención al cliente con IA y Web3. Tu tono debe ser amable, cercano y profesional, como si hablaras con un amigo. Usa un lenguaje natural, sé conciso (máximo 2 o 3 párrafos por respuesta) y usa emojis ocasionalmente para ser más cálido. Evita sonar como un robot o usar jerga técnica innecesaria. Tu objetivo es ayudar al usuario con dudas sobre la plataforma, sus servicios de IA, pagos con criptomonedas (USDC en Polygon) y configuración de burbujas de chat. Si no sabes algo, discúlpate amablemente y ofrece contactar a soporte."
  };

  const mensajesParaEnviar = [systemPrompt, ...historial];

  let apiKey, url, body;
  const headers = { 'Content-Type': 'application/json' };

  try {
    switch (provider) {
      case 'openrouter': {
        apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');
        
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'https://synapse-v3-alpha.vercel.app';
        headers['X-Title'] = 'Synapse AI';
        
        body = {
          model: model || 'x-ai/grok-2-1212',
          messages: mensajesParaEnviar,
          temperature: 0.85,
          max_tokens: 300
        };
        break;
      }
      case 'groq': {
        apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('GROQ_API_KEY no configurada');
        
        url = 'https://api.groq.com/openai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        
        body = {
          model: model || 'llama-3.1-8b-instant',
          messages: mensajesParaEnviar,
          temperature: 0.85,
          max_tokens: 300
        };
        break;
      }
      default:
        throw new Error('Proveedor no soportado');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Error ${response.status} desde ${provider}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    
    res.status(200).json({ reply });

  } catch (error) {
    console.error('Error en el backend:', error);
    res.status(500).json({ error: error.message });
  }
}
