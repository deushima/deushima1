# DEUSHIMA® / IVÁN RODRÍGUEZ — Portfolio inmersivo

Sitio one-page para **Iván Rodríguez**, diseñador gráfico y director de arte argentino de 26 años. Actualmente trabaja en **Sushiclub** y su estudio/marca personal es **Deushima**. La narrativa está atada al scroll: una secuencia de 65 fotogramas se reproduce fotograma a fotograma dentro de una sección fija, seguida por manifiesto, casos de estudio, archivo visual, servicios, reconocimiento y contacto.

> Proyecto de demostración. Los casos, marcas y premios que aparecen son ficticios; la identidad y los datos de contacto corresponden a Iván Rodríguez / Deushima.

**Contacto:** [deushima@gmail.com](mailto:deushima@gmail.com) · [Instagram @deushima](https://www.instagram.com/deushima) · [deushima.com.ar](https://www.deushima.com.ar/)

## Cómo verlo

La forma más simple es abrir **`index.html`** en Chrome, Edge o Firefox. Funciona también desde `file://` porque todos los assets son locales.

Para servirlo por HTTP:

```bash
python -m http.server 8080
# luego abrir http://localhost:8080
```

O con Node:

```bash
npx serve .
```

## Experiencia

- **Hero cinematográfico:** 65 frames WebP extraídos de video, dibujados en `<canvas>` según el progreso de scroll. Incluye precarga con contador, timecode y cuatro capítulos tipográficos.
- **Sistema ASCII:** una sección completa que convierte un retrato de Éter en una retícula viva de caracteres. Incluye decodificación animada, telemetría de render, marco de monitor, scanline y un glitch local que sigue al cursor.
- **ASCII Lab:** cuatro piezas animadas del proyecto open source [ascii-magic-art](https://github.com/kailashsr38/ascii-magic-art) —Liquid Chrome, Spinning Torus, Deushima Decode y Wireframe Globe— con selector de pieza, looks (ASCII, dots, binary, dither), modo mono/color y pausa. “Deushima Decode” es una adaptación propia de la pieza `decode-reveal`, con el nombre de la marca y la paleta del sitio. El motor y las piezas están empaquetados localmente; funciona también desde `file://`.
- **Casos apilados:** cuatro proyectos con tarjetas sticky, overlays de dirección de arte, transiciones y fichas de caso en un overlay accesible.
- **Archivo horizontal:** galería de fragmentos que se desplaza lateralmente mientras se hace scroll vertical.
- **Transiciones de terminal:** wipe tipográfico al navegar entre módulos, boot log durante la carga, revelados por scanline y un cursor propio. Los títulos se decodifican al aparecer, pero no al pasar el mouse: sin glitches ni desplazamientos de letras al hacer hover.
- **Detalles:** tipografía editorial, marquesinas, contadores, parallax sutil, preview de servicios que sigue al cursor, reloj de Buenos Aires, menú móvil a pantalla completa y grano analógico.
- **Accesibilidad:** navegación por teclado, foco visible, `aria-label`s, cierre con Escape, respeto por `prefers-reduced-motion` y fallback sin JavaScript para el contenido principal.
- **Responsive:** layout propio para desktop, tablet y mobile. En mobile los casos pasan a imagen + ficha, el ASCII se recompone y la galería se recorre con swipe.

## Estructura

```text
index.html
css/
  style.css
js/
  app.js
assets/
  fonts/     · Archivo, Instrument Serif y JetBrains Mono (woff2)
  frames/    · 65 frames WebP de la secuencia del hero
  img/       · imágenes de proyectos, fragmentos, textura y ruido
  js/        · lenis.min.js + fuente ASCII embebida (funciona también en file://)
  ascii/     · ascii-lab.js (runtime + 4 piezas bundleadas), LICENSE y NOTICE
  favicon.svg
```

## Créditos

- Video del hero: **Coverr**, “Fiery Glance — Intense Red Portrait”.
- Fotografía: **Unsplash** (proyectos, fragmentos y taller).
- Tipografías: **Archivo**, **Instrument Serif** y **JetBrains Mono** vía Google Fonts (SIL Open Font License).
- Scroll suave: **Lenis**, MIT License.
- Piezas y runtime ASCII Lab: **ascii-magic-art** de Kailash Srivastava, MIT License. El código original está en [github.com/kailashsr38/ascii-magic-art](https://github.com/kailashsr38/ascii-magic-art); la licencia y el aviso están incluidos en `assets/ascii/`. “Deushima Decode” es una adaptación de `decode-reveal` con textos y paleta propios.
- Dirección, diseño y desarrollo: **Iván Rodríguez / Deushima**. Los casos y marcas son ficticios.

## Notas técnicas

- Sin frameworks ni build step: HTML, CSS y JavaScript vanilla.
- La secuencia del hero usa `requestAnimationFrame` y evita seeks de video para mantener el scrub estable.
- El retrato ASCII se calcula en vivo con ecualización de histograma sobre un recorte embebido en `assets/js/ascii-source.js`; así también funciona abriendo el sitio desde `file://`, sin problemas de canvas contaminado.
- Las piezas del ASCII Lab se bundlean a un script clásico (`assets/ascii/ascii-lab.js`) con esbuild; de ese modo los módulos ES de ascii-magic-art también funcionan desde `file://` sin CORS.
- `prefers-reduced-motion` desactiva el pinning, el cursor propio, Lenis y las animaciones; el laboratorio arranca en pausa y el contenido sigue disponible.
- Probado en Chrome 155 (headless, desktop/mobile y `file://`) sin errores de consola.
