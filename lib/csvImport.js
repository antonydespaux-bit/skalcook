/**
 * Lecture des exports CSV de caisse (Lightspeed, L'Addition, Zelty…) :
 * décodage UTF-8 / Windows-1252, séparateur deviné, nombres FR ou EN.
 */

/**
 * Parse une ligne CSV (délimiteur paramétrable, guillemets doubles).
 */
function parseCsvLine(line, delimiter = ',') {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

/**
 * Devine le séparateur d'après la ligne d'en-tête : virgule, point-virgule
 * (exports FR : Lightspeed, L'Addition, Zelty…) ou tabulation. On compte les
 * occurrences hors guillemets et on retient le plus fréquent.
 */
function detectDelimiter(headerLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch] += 1
  }
  let best = ','
  for (const d of [';', '\t']) {
    if (counts[d] > counts[best]) best = d
  }
  return best
}

/**
 * Décode les octets du fichier en texte. Essaie UTF-8 ; si des caractères de
 * remplacement (�) apparaissent, retombe sur Windows-1252 (exports FR non-UTF-8,
 * où « é » = octet 0xE9).
 */
export function decodeFileBytes(buf) {
  const bytes = new Uint8Array(buf)
  let text = new TextDecoder('utf-8').decode(bytes)
  if (text.includes('�')) {
    try {
      text = new TextDecoder('windows-1252').decode(bytes)
    } catch {
      // TextDecoder('windows-1252') indisponible : on garde l'UTF-8.
    }
  }
  return text
}

/** Parse le fichier CSV (en-tête + lignes de données). */
export function parseCsv(text) {
  const raw = text.replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter)
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter)
    if (cells.length === 1 && cells[0] === '') continue
    rows.push(cells)
  }
  return { headers, rows }
}

export function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse un nombre (virgule/point, espaces retirés). */
export function parseNumberLoose(raw) {
  if (raw == null || raw === '') return NaN
  let s = String(raw).trim().replace(/\u00a0/g, ' ').replace(/\s/g, '')
  if (!s || s === '-') return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}
