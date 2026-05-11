'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import RapportSections from '../../../../components/rapport-hebdo/RapportSections'
import ArticlesModal from '../../../../components/rapport-hebdo/ArticlesModal'
import ComparaisonPanel from '../../../../components/rapport-hebdo/ComparaisonPanel'
import {
  buildRapportData,
  semaineEnCours,
  semainePrecedente,
  formatPeriode,
} from '../../../../lib/rapportHebdo'
import { buildRapportHtml, downloadHtmlFile, copyHtmlToClipboard } from '../../../../lib/rapportHebdoExport'

const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

export default function RapportHebdoPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // Période sélectionnée (par défaut : semaine précédente — le rapport
  // s'envoie le lundi matin sur la semaine passée).
  const initialPeriode = useMemo(() => semainePrecedente(), [])
  const [debut, setDebut] = useState(initialPeriode.debut)
  const [fin, setFin] = useState(initialPeriode.fin)

  // Données chargées
  const [lieux, setLieux] = useState([])
  const [caRows, setCaRows] = useState([])
  const [budgetRows, setBudgetRows] = useState([])
  const [loading, setLoading] = useState(false)

  // Commentaire et rapport courant (id si chargé depuis archive)
  const [commentaire, setCommentaire] = useState('')
  const [currentRapportId, setCurrentRapportId] = useState(null)
  const [titre, setTitre] = useState('')
  const [saving, setSaving] = useState(false)

  // Archives
  const [archives, setArchives] = useState([])
  const [archivesLoading, setArchivesLoading] = useState(false)

  // Articles (menus / suppléments) référencés pour ce client
  const [articles, setArticles] = useState([])
  // Quantités saisies pour le rapport courant — { article_id: qte }
  const [articlesVentes, setArticlesVentes] = useState({})
  const [articlesModalOpen, setArticlesModalOpen] = useState(false)

  // Mode comparaison : si actif, affiche un tableau côte à côte avec des
  // périodes additionnelles. Données chargées à la volée.
  const [compareMode, setCompareMode] = useState(false)
  const [comparePeriodes, setComparePeriodes] = useState([]) // [{ debut, fin }]

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (cancel) return
        if (!sessionData?.session) { router.replace('/'); return }
        let cid = await getClientId()
        if (!cid) cid = DEBUG_FALLBACK_CLIENT_ID
        if (cancel) return
        setClientId(cid)
        setAuthReady(true)
      } catch (e) {
        if (cancel) return
        setClientId(DEBUG_FALLBACK_CLIENT_ID)
        setAuthReady(true)
      }
    })()
    return () => { cancel = true }
  }, [router])

  // Restreint l'accès aux profils admin / directeur
  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

  // ── Chargement des données pour la période ──────────────────────────────
  const loadData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      // On a besoin des ca_journalier et ca_budgets pour TOUS les mois
      // touchés par la période (peut chevaucher 2 mois). On charge sur
      // un range qui couvre.
      const [y1, m1] = debut.split('-').map(Number)
      const [y2, m2] = fin.split('-').map(Number)
      const annees = Array.from(new Set([y1, y2]))

      const [lieuxRes, caRes, budgetRes] = await Promise.all([
        supabase
          .from('lieux_service')
          .select('id, nom, ordre, actif')
          .eq('client_id', clientId)
          .eq('actif', true)
          .order('ordre').order('nom'),
        supabase
          .from('ca_journalier')
          .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
          .eq('client_id', clientId)
          .gte('jour', debut)
          .lte('jour', fin),
        supabase
          .from('ca_budgets')
          .select('annee, mois, jour_semaine, lieu_service_id, service, couverts_cible, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
          .eq('client_id', clientId)
          .in('annee', annees),
      ])
      if (lieuxRes.error) throw lieuxRes.error
      if (caRes.error) throw caRes.error
      if (budgetRes.error) throw budgetRes.error
      setLieux(lieuxRes.data || [])
      setCaRows(caRes.data || [])
      setBudgetRows(budgetRes.data || [])
      // Pour le cumul mois, on a besoin aussi des CA depuis le 1er du mois
      // de `fin`. On élargit si nécessaire.
      const firstOfMonth = `${y2}-${String(m2).padStart(2, '0')}-01`
      if (firstOfMonth < debut) {
        const extraCa = await supabase
          .from('ca_journalier')
          .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
          .eq('client_id', clientId)
          .gte('jour', firstOfMonth)
          .lt('jour', debut)
        if (!extraCa.error) setCaRows((prev) => [...(extraCa.data || []), ...prev])
      }
      void y1; void m1
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, debut, fin])

  useEffect(() => {
    if (authReady && clientId) loadData()
  }, [authReady, clientId, loadData])

  // ── Chargement des archives ────────────────────────────────────────────
  const loadArchives = useCallback(async () => {
    if (!clientId) return
    setArchivesLoading(true)
    try {
      const { data, error: e } = await supabase
        .from('ca_rapports_hebdo')
        .select('id, debut, fin, titre, commentaire, articles_ventes, created_at, updated_at')
        .eq('client_id', clientId)
        .order('debut', { ascending: false })
        .limit(50)
      if (e) throw e
      setArchives(data || [])
    } catch (e) {
      setError(e.message || 'Erreur de chargement archives')
    } finally {
      setArchivesLoading(false)
    }
  }, [clientId])

  useEffect(() => { if (authReady && clientId) loadArchives() }, [authReady, clientId, loadArchives])

  // ── Chargement des articles ─────────────────────────────────────────────
  const loadArticles = useCallback(async () => {
    if (!clientId) return
    try {
      const { data, error: e } = await supabase
        .from('ca_articles')
        .select('id, nom, type, service, ordre')
        .eq('client_id', clientId)
        .eq('actif', true)
        .order('type').order('service').order('ordre').order('nom')
      if (e) throw e
      setArticles(data || [])
    } catch (e) {
      console.warn('Erreur chargement articles :', e?.message || e)
    }
  }, [clientId])

  useEffect(() => { if (authReady && clientId) loadArticles() }, [authReady, clientId, loadArticles])

  // ── Données dérivées ────────────────────────────────────────────────────
  const lieuxMap = useMemo(() => new Map(lieux.map((l) => [l.id, l.nom])), [lieux])
  const data = useMemo(() => buildRapportData({ caRows, budgetRows, lieuxMap, debut, fin }),
    [caRows, budgetRows, lieuxMap, debut, fin])

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleSemainePrec = () => {
    setCurrentRapportId(null); setCommentaire(''); setTitre('')
    const p = semainePrecedente()
    setDebut(p.debut); setFin(p.fin)
  }
  const handleSemaineCour = () => {
    setCurrentRapportId(null); setCommentaire(''); setTitre('')
    const p = semaineEnCours()
    setDebut(p.debut); setFin(p.fin)
  }

  const handleSave = async () => {
    if (!clientId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const payload = {
        debut, fin, commentaire,
        titre: titre || null,
        articles_ventes: articlesVentes || {},
      }
      if (currentRapportId) {
        const { error: e } = await supabase
          .from('ca_rapports_hebdo')
          .update(payload)
          .eq('id', currentRapportId)
        if (e) throw e
        setOkMsg('Rapport mis à jour.')
      } else {
        const { data: ins, error: e } = await supabase
          .from('ca_rapports_hebdo')
          .insert({ client_id: clientId, ...payload })
          .select('id')
          .single()
        if (e) throw e
        setCurrentRapportId(ins.id)
        setOkMsg('Rapport sauvegardé.')
      }
      await loadArchives()
    } catch (e) {
      setError(e.message || 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = (rapport) => {
    setCurrentRapportId(rapport.id)
    setDebut(rapport.debut)
    setFin(rapport.fin)
    setCommentaire(rapport.commentaire || '')
    setTitre(rapport.titre || '')
    setArticlesVentes(rapport.articles_ventes || {})
    setOkMsg('')
    setError('')
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce rapport ?')) return
    try {
      const { error: e } = await supabase.from('ca_rapports_hebdo').delete().eq('id', id)
      if (e) throw e
      if (id === currentRapportId) setCurrentRapportId(null)
      await loadArchives()
    } catch (e) {
      setError(e.message || 'Erreur de suppression')
    }
  }

  const handleNouveau = () => {
    setCurrentRapportId(null)
    setCommentaire('')
    setTitre('')
    setArticlesVentes({})
    setOkMsg('')
    setError('')
  }

  const handleChangeArticleQte = (articleId, qte) => {
    setArticlesVentes((prev) => ({ ...prev, [articleId]: qte }))
  }

  const handleCopyEmail = async () => {
    setError(''); setOkMsg('')
    try {
      const html = buildRapportHtml({
        data, debut, fin, commentaire, titre,
        articles, articlesVentes,
      })
      await copyHtmlToClipboard(html)
      setOkMsg('Rapport copié dans le presse-papier — colle dans Gmail / Outlook.')
    } catch (e) {
      setError(e.message || 'Erreur lors de la copie')
    }
  }

  const handleDownloadHtml = () => {
    setError(''); setOkMsg('')
    try {
      const html = buildRapportHtml({
        data, debut, fin, commentaire, titre,
        articles, articlesVentes,
      })
      downloadHtmlFile(html, `rapport-ca_${debut}_${fin}.html`)
    } catch (e) {
      setError(e.message || 'Erreur lors du téléchargement')
    }
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Rapport hebdomadaire
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {formatPeriode(debut, fin)}
              {currentRapportId && <span style={{ marginLeft: 8, color: c.accent, fontWeight: 500 }}>• rapport archivé</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleSemainePrec} style={btnSecondary(c)}>Semaine précédente</button>
            <button onClick={handleSemaineCour} style={btnSecondary(c)}>Semaine en cours</button>
            <button onClick={handleNouveau} style={btnSecondary(c)} title="Nouveau rapport vide">+ Nouveau</button>
            <button onClick={() => setArticlesModalOpen(true)} style={btnSecondary(c)}
              title="Configurer les menus et suppléments suivis">
              📋 Articles
            </button>
            <button
              onClick={() => setCompareMode((m) => !m)}
              style={{ ...btnSecondary(c), background: compareMode ? c.accent : c.blanc, color: compareMode ? c.texte : c.texte, fontWeight: compareMode ? 600 : 400 }}
              title="Activer le mode comparaison de plusieurs périodes">
              ⇄ Comparer
            </button>
          </div>
        </div>

        {/* Filtres période */}
        <div style={{
          background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12,
          padding: isMobile ? 12 : 16, marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
            Du
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)}
              style={dateInputStyle(c)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
            au
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
              style={dateInputStyle(c)} />
          </label>
          <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre optionnel (ex: Rapport semaine 19)"
            style={{ ...dateInputStyle(c), flex: 1, minWidth: 200 }} />
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 12 }}>{error}</p>}
        {okMsg && <p style={{ color: '#15803D', fontSize: 14, marginBottom: 12 }}>{okMsg}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: isMobile ? 16 : 20 }}>
          {/* Rapport rendu */}
          <div style={{
            background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12,
            padding: isMobile ? 16 : 24,
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: c.texte }}>
              Bonjour à tous,
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: c.texte }}>
              Ci-dessous le rapport du CA pour la <strong>période {formatPeriode(debut, fin)}</strong> ainsi
              que le cumul depuis le début du mois :
            </p>

            {loading ? (
              <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement des données…</p>
            ) : (
              <RapportSections
                c={c} data={data} debut={debut} fin={fin}
                articles={articles}
                articlesVentes={articlesVentes}
                editableArticles
                onChangeQte={handleChangeArticleQte}
              />
            )}

            {/* Commentaires */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{
                fontSize: 14, fontWeight: 600, color: c.accent,
                margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.4,
              }}>
                Commentaires
              </h3>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Précisions / analyses qualitatives à inclure dans l'email…"
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
                  fontSize: 14, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} style={btnPrimary(c, saving)}>
                {saving ? 'Sauvegarde…' : currentRapportId ? '💾 Mettre à jour' : '💾 Sauvegarder'}
              </button>
              <button onClick={handleCopyEmail} style={btnSecondary(c)}>
                📋 Copier pour email
              </button>
              <button onClick={handleDownloadHtml} style={btnSecondary(c)}>
                📥 Télécharger HTML
              </button>
            </div>
          </div>

          {/* Sidebar archives */}
          <aside style={{
            background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12,
            padding: 12, alignSelf: 'start',
          }}>
            <div style={{ fontSize: 12, color: c.texteMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
              Archives
            </div>
            {archivesLoading ? (
              <div style={{ fontSize: 12, color: c.texteMuted }}>Chargement…</div>
            ) : archives.length === 0 ? (
              <div style={{ fontSize: 12, color: c.texteMuted, padding: '12px 0' }}>
                Aucun rapport sauvegardé. Crée-en un depuis cette page.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {archives.map((r) => (
                  <ArchiveRow
                    key={r.id}
                    c={c}
                    rapport={r}
                    active={r.id === currentRapportId}
                    onLoad={() => handleLoad(r)}
                    onDelete={() => handleDelete(r.id)}
                  />
                ))}
              </div>
            )}
          </aside>
        </div>

        {/* Mode comparaison */}
        {compareMode && (
          <ComparaisonPanel
            c={c}
            isMobile={isMobile}
            clientId={clientId}
            currentPeriode={{ debut, fin }}
            periodes={comparePeriodes}
            onPeriodesChange={setComparePeriodes}
          />
        )}

        {articlesModalOpen && (
          <ArticlesModal
            c={c}
            clientId={clientId}
            onClose={() => setArticlesModalOpen(false)}
            onChange={loadArticles}
          />
        )}
      </div>
    </div>
  )
}

function ArchiveRow({ c, rapport, active, onLoad, onDelete }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6,
      border: `1px solid ${active ? c.accent : c.bordure}`,
      background: active ? c.accentClair : 'transparent',
      cursor: 'pointer',
    }}
      onClick={onLoad}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: c.texte, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rapport.titre || formatPeriode(rapport.debut, rapport.fin)}
          </div>
          <div style={{ fontSize: 11, color: c.texteMuted }}>
            {rapport.debut} → {rapport.fin}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'transparent', border: 'none', color: c.texteMuted,
            cursor: 'pointer', fontSize: 14, padding: '2px 6px',
          }}
          title="Supprimer"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function btnPrimary(c, disabled) {
  return {
    padding: '8px 14px', borderRadius: 8, fontSize: 13,
    border: 'none', background: c.accent, color: c.texte,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, opacity: disabled ? 0.6 : 1,
  }
}

function btnSecondary(c) {
  return {
    padding: '8px 14px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
    cursor: 'pointer',
  }
}

function dateInputStyle(c) {
  return {
    padding: '7px 10px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
  }
}
