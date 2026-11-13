// Extrae el texto de un PDF reconstruyendo las líneas por posición en la página.
// (El orden interno de los items de un PDF no siempre coincide con el visual,
// así que agrupamos por altura (y) y ordenamos de izquierda a derecha (x).)

export interface TextItem { str: string; transform: number[]; width?: number }

export function layoutText(items: TextItem[], yTolerance = 3): string {
  const rows: { y: number; parts: { x: number; end: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, end: x + (it.width ?? 0), s: it.str.trim() });
  }
  rows.sort((a, b) => b.y - a.y); // de arriba hacia abajo
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEnd = -Infinity;
      for (const p of r.parts) {
        line += (line ? (p.x - prevEnd > 12 ? "   " : " ") : "") + p.s;
        prevEnd = p.end || p.x;
      }
      return line;
    })
    .join("\n");
}

/** Lee un PDF (en el navegador) y devuelve su texto. pdf.js se carga solo cuando hace falta. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(layoutText(content.items as TextItem[]));
  }
  return pages.join("\n\n");
}
