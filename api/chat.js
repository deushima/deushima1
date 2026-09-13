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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const message = String(req.body?.message || '').trim().slice(0, 600);
  if (!message) return res.status(400).json({ error: 'Message required' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(200).json({ reply: localReply(message), mode: 'local' });

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
          { role: 'user', content: [{ type: 'input_text', text: message }] }
        ],
        max_output_tokens: 280
      })
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    const reply = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    return res.status(200).json({ reply: reply?.trim() || localReply(message), mode: reply ? 'ai' : 'local' });
  } catch (error) {
    console.error('Portfolio assistant fallback:', error);
    return res.status(200).json({ reply: localReply(message), mode: 'local' });
  }
};
