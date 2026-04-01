export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, mediaType } = req.body;

  if (!imageData || !mediaType) {
    return res.status(400).json({ error: 'Missing imageData or mediaType' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const isImage = mediaType.startsWith('image/');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: `You are an expert at reading supplier invoices for restaurants.
Extract all line items from the invoice.
Return ONLY a valid JSON array — no markdown, no backticks, no explanation.
Each item must have: {"name": string, "qty": number, "unit": string, "price": number, "supplier": string}
- name: the product name
- qty: quantity ordered (number)
- unit: unit of measure (oz, lbs, cases, bottles, units, etc.)
- price: cost per unit in dollars (not total line cost)
- supplier: supplier/vendor name if visible on invoice, otherwise "Unknown"
If you cannot determine a value use null.
Return only the JSON array, nothing else.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: isImage ? 'image' : 'document',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData
              }
            },
            {
              type: 'text',
              text: 'Extract all line items from this invoice as a JSON array.'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Anthropic API error: ' + err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';

    // Parse and validate JSON
    let items = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      items = JSON.parse(clean);
      if (!Array.isArray(items)) items = [];
    } catch (e) {
      return res.status(200).json({ items: [], error: 'Could not parse response — try a clearer photo.' });
    }

    return res.status(200).json({ items: items.filter(i => i && i.name) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
