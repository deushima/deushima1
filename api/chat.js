const SYSTEM_PROMPT = `Sos el asistente del portfolio Deushima, la práctica independiente de Iván Lautaro Rodríguez, diseñador gráfico y director visual radicado en Buenos Aires, Argentina.

Datos permitidos:
- Iván trabaja entre dirección visual, diseño gráfico, campañas, identidad, packaging, social content, motion, 3D, IA generativa y creative coding.
- Actualmente forma parte del equipo de diseño de SushiClub Argentina y desarrolla Deushima como práctica independiente.
- 3Deushima es un workspace interactivo para explorar materiales, forma, extrusión y comportamiento visual de la marca en tiempo real.
- Contacto: deushima@gmail.com. También hay enlaces de Behance, Instagram y LinkedIn en el sitio.

Respondé en español rioplatense salvo que el usuario escriba en otro idioma. Sé concreto, profesional y visual. No inventes clientes, cargos, premios, fechas ni proyectos que no figuren arriba. Si te preguntan algo que no sabés, decilo y derivá al contacto.`;

function localReply(message) {
  const text = String(message || '').toLowerCase();
  if (/3d|launcher|lab|three|webgl/.test(text)) return '3Deushima es un workspace interactivo para explorar materiales, forma, extrusión y comportamiento visual de la marca en tiempo real.';
  if (/contact|mail|correo|contratar|colabor|proyecto/.test(text)) return 'Podés contactar a Iván en deushima@gmail.com. También tenés Behance, Instagram y LinkedIn desde el sitio.';
  if (/sushi|trabaja|actualmente|empleo/.test(text)) return 'Actualmente Iván forma parte del equipo de diseño de SushiClub Argentina y desarrolla Deushima en paralelo como práctica independiente.';
  if (/qué hace|que hace|servicio|especialidad|diseñ|ai|ia|motion|brand|packaging|campaña/.test(text)) return 'Deushima trabaja entre dirección visual, diseño gráfico, campañas, identidad, packaging, social content, motion, 3D, IA generativa y creative coding.';
  if (/quién|quien|ivan|iván|about|perfil/.test(text)) return 'Iván Lautaro Rodríguez es diseñador gráfico y director visual radicado en Buenos Aires, Argentina. Deushima es su práctica independiente y laboratorio creativo.';
  return 'Puedo contarte sobre el perfil de Iván, sus áreas de trabajo, 3Deushima, proyectos seleccionados y contacto.';
}

function extractReply(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const message = String(req.body?.message || '').trim().slice(0, 600);
  if (!message) return res.status(400).json({ error: 'Message required' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(200).json({ reply: localReply(message), mode: 'local' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://www.deushima.com.ar',
        'X-Title': 'Deushima Portfolio Assistant'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        max_tokens: 280,
        temperature: 0.55
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenRouter ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }

    const data = await response.json();
    const reply = extractReply(data);
    return res.status(200).json({
      reply: reply || localReply(message),
      mode: reply ? 'ai' : 'local'
    });
  } catch (error) {
    console.error('Portfolio assistant fallback:', error);
    return res.status(200).json({ reply: localReply(message), mode: 'local' });
  }
};
