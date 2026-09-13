const PROFILE_CONTEXT = require('./profile-context');

const SYSTEM_PROMPT = `Sos el asistente oficial del portfolio Deushima. Tu función es explicar con precisión quién es Iván Lautaro Rodríguez / Iván Deushima, cómo trabaja, qué puede aportar a un cliente y cómo integra diseño, IA, automatización y tecnología.

Usá como fuente principal el siguiente expediente profesional. No reduzcas su perfil a una sola herramienta o disciplina y no inventes clientes, cargos, premios, fechas ni proyectos que no estén respaldados por este contexto.

${PROFILE_CONTEXT}

Información adicional del sitio:
- 3Deushima es un workspace interactivo para explorar materiales, forma, extrusión y comportamiento visual de la marca en tiempo real.
- Contacto: deushima@gmail.com. También hay enlaces de Behance, Instagram y LinkedIn en el sitio.

Estilo de respuesta:
- Respondé en español rioplatense salvo que el usuario escriba en otro idioma.
- Sé concreto, profesional y claro, pero podés ampliar cuando la pregunta requiera contexto.
- Priorizá explicar el criterio y la forma de pensar de Iván por encima de enumerar software.
- Si preguntan por servicios o colaboración, conectá la respuesta con problemas concretos que Iván puede resolver.
- Si algo no está respaldado por el expediente o por la información del sitio, decilo en lugar de inventarlo.`;

function localReply(message) {
  const text = String(message || '').toLowerCase();
  if (/3d|launcher|lab|three|webgl/.test(text)) return '3Deushima es un workspace interactivo para explorar materiales, forma, extrusión y comportamiento visual de la marca en tiempo real.';
  if (/sushi|trabaja|actualmente|empleo/.test(text)) return 'Actualmente Iván trabaja como Diseñador Gráfico en SushiClub Argentina, dentro del equipo creativo, desarrollando campañas, comunicación visual, contenido digital y trabajo de producto. En paralelo desarrolla Deushima como práctica y plataforma creativa propia.';
  if (/quién|quien|ivan|iván|about|perfil/.test(text)) return 'Iván Deushima es un diseñador gráfico y creativo tecnológico argentino. Actualmente trabaja en SushiClub Argentina y, en paralelo, desarrolla Deushima, donde combina dirección visual, IA, automatización, desarrollo web y creación de herramientas digitales.';
  if (/program|codigo|código|desarroll|automat|plugin|script/.test(text)) return 'Iván no se define como desarrollador tradicional full-time: usa código y programación asistida por IA para resolver problemas, construir webs, interfaces, plugins, automatizaciones, prototipos y herramientas creativas.';
  if (/(^|[^a-záéíóúñ])(ia|ai)(?=$|[^a-záéíóúñ])|inteligencia artificial|generativ|kling|krea|magnific|higgsfield/.test(text)) return 'La IA forma parte de su workflow como una capa de producción y dirección, no como un generador automático. Iván combina distintos modelos con Photoshop, video, código y automatización, seleccionando la herramienta según fidelidad, control y resultado.';
  if (/experiment|conectom|simulac|videojuego|agente|cient|neuronal/.test(text)) return 'Fuera del trabajo profesional, Iván explora IA, simulaciones, interfaces, agentes, videojuegos, visualización de datos y conceptos como conectomas o mapeo neuronal, buscando convertir ideas complejas en experiencias, herramientas o visualizaciones interactivas.';
  if (/qué hace|que hace|servicio|especialidad|diseñ|motion|brand|packaging|campaña/.test(text)) return 'Iván trabaja en la intersección entre diseño gráfico, dirección visual, campañas, contenido digital, IA generativa, motion, automatización y desarrollo de experiencias. Su diferencial está en diseñar sistemas creativos y workflows, no solamente piezas aisladas.';
  if (/contact|mail|correo|contratar|colabor|presupuesto/.test(text)) return 'Podés contactar a Iván en deushima@gmail.com. También tenés Behance, Instagram y LinkedIn desde el sitio.';
  return 'Puedo contarte sobre el perfil de Iván, cómo trabaja, su uso de IA, SushiClub, automatización, desarrollo, 3Deushima, servicios y contacto.';
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
        max_tokens: 420,
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
