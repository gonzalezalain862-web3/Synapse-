export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_name, event_data, user_data } = req.body;

  if (!event_name || !user_data) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || '2653577768390875';

  if (!accessToken) {
    return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  }

  const payload = {
    data: [{
      event_name: event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: event_data?.event_source_url || 'https://synapse-v3-alpha.vercel.app',
      action_source: 'website',
      user_data: {
        client_ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        client_user_agent: req.headers['user-agent'],
        ...user_data
      },
      custom_data: event_data?.custom_data || {}
    }]
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', result);
      return res.status(response.status).json({ error: result });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error sending to Meta:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
