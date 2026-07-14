export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { message, provider = 'groq', model = '' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Falta el mensaje' });
  }

  let apiKey, url, body, headers = { 'Content-Type': 'application/json' };

  try {
    switch (provider) {
      case 'groq': {
        apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('GROQ_API_KEY no configurada');
        url = 'https://api.groq.com/openai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: model || 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'Eres un asistente útil y amigable de Assistent.ai' },
            { role: 'user', content: message }
          ],
          temperature: 0.8,
          max_tokens: 500
        };
        break;
      }
      case 'openrouter': {
        apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'https://synapse-v2-alpha.vercel.app';
        headers['X-Title'] = 'Assistent.ai';
        body = {
          model: model || 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            { role: 'system', content: 'Eres un asistente útil y amigable de Assistent.ai' },
            { role: 'user', content: message }
          ],
          temperature: 0.8,
          max_tokens: 500
        };
        break;
      }
      case 'github': {
        apiKey = process.env.GITHUB_TOKEN;
        if (!apiKey) throw new Error('GITHUB_TOKEN no configurado');
        url = 'https://models.inference.ai.azure.com/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un asistente útil y amigable de Assistent.ai' },
            { role: 'user', content: message }
          ],
          temperature: 0.8,
          max_tokens: 500
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
    res.status(500).json({ error: error.message });
  }
}
