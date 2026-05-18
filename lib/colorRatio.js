/**
 * Couleur d'un ratio (Δ % vs budget, vs N-1, etc.) :
 *   - null  → null  (caller décide du fallback, ex: c.texteMuted)
 *   - ≥ 0   → vert  (positif = au-dessus / mieux)
 *   - < 0   → rouge (négatif = en dessous / moins bien)
 *
 * Utilisé côté UI (couleurs theme) ET côté export Outlook (couleurs hex
 * statiques) — la palette est passée en argument pour rester découplé du
 * ThemeProvider client-side.
 */
export function colorForRatio(ratio, palette) {
  if (ratio == null) return null
  return ratio >= 0 ? palette.vert : palette.rouge
}
