'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../../lib/supabase'
import { appelApiRequisitions } from '../../../lib/requisitions/apiClient'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { texteSurAccent } from '../../../lib/theme.jsx'
import { UNITES_ARTICLES } from '../../../lib/constants'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

// Réquisitions › Catalogue d'articles : produits hors cuisine et bar
// (économat, entretien…) servis par les services au stock « articles ».
// Modifiable par les membres du service et les administrateurs ; lisible par
// tous ceux qui ont accès aux réquisitions.

const ARTICLE_VIDE = { nom: '', categorie: '', reference: '', unite: 'u', prix_unitaire: '' }

const versApi = (a) => ({
  nom: a.nom,
  categorie: a.categorie || null,
  reference: a.reference || null,
  unite: a.unite,
  prix_unitaire: a.prix_unitaire === '' || a.prix_unitaire == null ? null : Number(String(a.prix_unitaire).replace(',', '.')),
})

export default function CatalogueArticlesPage() {
  const { t, i18n } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const surAccent = texteSurAccent(c)

  const [clientId, setClientId] = useState(null)
  const [services, setServices] = useState([])
  const [articles, setArticles] = useState([])
  const [serviceId, setServiceId] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [voirInactifs, setVoirInactifs] = useState(false)
  const [nouveau, setNouveau] = useState(ARTICLE_VIDE)
  const [edition, setEdition] = useState(null)

  const afficher = useCallback((texte, type = 'success') => {
    setMessage({ texte, type })
    setTimeout(() => setMessage(null), 3500)
  }, [])

  const recuperer = useCallback(async () => {
    const id = await getClientId()
    if (!id) return { id: null }
    const d = await appelApiRequisitions(`/api/requisitions/articles?client_id=${encodeURIComponent(id)}`)
    return { id, d }
  }, [])

  const appliquer = useCallback(({ id, d }) => {
    setClientId(id)
    if (d) {
      setServices(d.services || [])
      setArticles(d.articles || [])
      setServiceId((courant) => (courant && d.services?.some((s) => s.id === courant)) ? courant : (d.services?.[0]?.id ?? null))
    }
    setChargement(false)
  }, [])

  const echec = useCallback((e) => {
    setChargement(false)
    afficher(e?.message || t('requisitions.articles.loadError'), 'error')
  }, [afficher, t])

  useEffect(() => {
    let annule = false
    recuperer()
      .then((r) => { if (!annule) appliquer(r) })
      .catch((e) => { if (!annule) echec(e) })
    return () => { annule = true }
  }, [recuperer, appliquer, echec])

  const service = services.find((s) => s.id === serviceId) || null
  const modifiable = !!service?.peut_modifier

  const duService = useMemo(() => articles.filter((a) => a.service_id === serviceId), [articles, serviceId])
  const categories = useMemo(
    () => [...new Set(duService.map((a) => a.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [duService],
  )
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return duService
      .filter((a) => voirInactifs || a.actif)
      .filter((a) => !q || [a.nom, a.categorie, a.reference].some((v) => (v || '').toLowerCase().includes(q)))
  }, [duService, recherche, voirInactifs])

  const formatPrix = (v) => (v == null ? '—' : new Intl.NumberFormat(i18n.language || 'fr', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v))

  const executer = async (fn, succes) => {
    setOccupe(true)
    try {
      await fn()
      if (succes) afficher(succes)
      appliquer(await recuperer())
      return true
    } catch (e) {
      afficher(e.message, 'error')
      return false
    } finally {
      setOccupe(false)
    }
  }

  const ajouter = async () => {
    if (!nouveau.nom.trim()) return
    const ok = await executer(
      () => appelApiRequisitions('/api/requisitions/articles', { method: 'POST', body: { client_id: clientId, service_id: serviceId, ...versApi(nouveau) } }),
      t('requisitions.articles.created', { nom: nouveau.nom.trim() }),
    )
    if (ok) setNouveau({ ...ARTICLE_VIDE, categorie: nouveau.categorie, unite: nouveau.unite })
  }

  const enregistrer = async () => {
    const ok = await executer(
      () => appelApiRequisitions('/api/requisitions/articles', { method: 'PATCH', body: { client_id: clientId, id: edition.id, ...versApi(edition) } }),
      t('requisitions.articles.updated'),
    )
    if (ok) setEdition(null)
  }

  const basculerActif = (a) => executer(
    () => appelApiRequisitions('/api/requisitions/articles', { method: 'PATCH', body: { client_id: clientId, id: a.id, actif: !a.actif } }),
    a.actif ? t('requisitions.articles.deactivated', { nom: a.nom }) : t('requisitions.articles.activated', { nom: a.nom }),
  )

  const supprimer = (a) => {
    if (!window.confirm(t('requisitions.articles.confirmDelete', { nom: a.nom }))) return
    executer(
      () => appelApiRequisitions('/api/requisitions/articles', { method: 'DELETE', body: { client_id: clientId, id: a.id } }),
      t('requisitions.articles.deleted', { nom: a.nom }),
    )
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const carte = { background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }
  const titreCarte = { fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }
  const champ = { padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }
  const boutonPrincipal = (actif = true) => ({
    padding: '9px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '500',
    background: actif ? c.accent : c.bordure, color: actif ? surAccent : c.texteMuted, cursor: actif ? 'pointer' : 'not-allowed',
  })
  const boutonSecondaire = { padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: 'transparent', color: c.texte, fontSize: '12px', cursor: 'pointer' }

  // Champs d'un article (création et édition). Fonction appelée, pas un
  // composant : sinon l'input serait remonté à chaque frappe.
  const champsArticle = (valeur, onChange) => (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1.2fr 1fr 0.8fr 1fr', gap: '10px' }}>
      <div>
        <label style={label}>{t('requisitions.articles.name')} *</label>
        <input type="text" value={valeur.nom} maxLength={120} placeholder={t('requisitions.articles.namePlaceholder')}
          onChange={(e) => onChange({ ...valeur, nom: e.target.value })} style={champ} />
      </div>
      <div>
        <label style={label}>{t('requisitions.articles.category')}</label>
        <input type="text" value={valeur.categorie || ''} maxLength={60} list="requisitions-categories"
          placeholder={t('requisitions.articles.categoryPlaceholder')}
          onChange={(e) => onChange({ ...valeur, categorie: e.target.value })} style={champ} />
      </div>
      <div>
        <label style={label}>{t('requisitions.articles.reference')}</label>
        <input type="text" value={valeur.reference || ''} maxLength={60}
          onChange={(e) => onChange({ ...valeur, reference: e.target.value })} style={champ} />
      </div>
      <div>
        <label style={label}>{t('requisitions.articles.unit')}</label>
        <select value={valeur.unite} onChange={(e) => onChange({ ...valeur, unite: e.target.value })} style={champ}>
          {[...new Set([...UNITES_ARTICLES, valeur.unite])].map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div>
        <label style={label}>{t('requisitions.articles.unitPrice')}</label>
        <input type="text" inputMode="decimal" value={valeur.prix_unitaire ?? ''} placeholder="0,00"
          onChange={(e) => onChange({ ...valeur, prix_unitaire: e.target.value })} style={champ} />
      </div>
    </div>
  )

  if (chargement) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <datalist id="requisitions-categories">
        {categories.map((cat) => <option key={cat} value={cat} />)}
      </datalist>

      <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '600', color: c.texte, margin: 0 }}>{t('requisitions.articles.title')}</h1>
          <div style={{ fontSize: '13px', color: c.texteMuted, marginTop: '6px' }}>{t('requisitions.articles.subtitle')}</div>
        </div>

        {message && (
          <div role="status" style={{
            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
            background: message.type === 'success' ? c.vertClair : c.rougeClair,
            color: message.type === 'success' ? c.vert : c.rouge,
          }}>{message.texte}</div>
        )}

        {services.length === 0 ? (
          <div style={{ ...carte, fontSize: '13px', color: c.texteMuted, lineHeight: 1.6 }}>{t('requisitions.articles.noCatalog')}</div>
        ) : (
          <>
            {/* Choix du catalogue (service) */}
            {services.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {services.map((s) => {
                  const actif = s.id === serviceId
                  return (
                    <button key={s.id} onClick={() => { setServiceId(s.id); setEdition(null) }} style={{
                      padding: '8px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      border: `0.5px solid ${actif ? c.accent : c.bordure}`,
                      background: actif ? c.accent : c.blanc, color: actif ? surAccent : c.texte,
                      opacity: s.actif ? 1 : 0.6,
                    }}>{s.emoji || '📦'} {s.nom}</button>
                  )
                })}
              </div>
            )}

            {/* Ajout */}
            {modifiable && (
              <div style={carte}>
                <div style={titreCarte}>{t('requisitions.articles.newTitle', { service: service?.nom })}</div>
                {champsArticle(nouveau, setNouveau)}
                <div style={{ marginTop: '14px' }}>
                  <button onClick={ajouter} disabled={occupe || !nouveau.nom.trim()} style={boutonPrincipal(!occupe && !!nouveau.nom.trim())}>
                    + {t('requisitions.articles.add')}
                  </button>
                </div>
              </div>
            )}

            {/* Liste */}
            <div style={carte}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ ...titreCarte, marginBottom: 0, flex: '1 1 auto' }}>
                  {service?.emoji || '📦'} {service?.nom} — {t('requisitions.articles.count', { count: duService.filter((a) => a.actif).length })}
                </div>
                <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  placeholder={t('requisitions.articles.search')} aria-label={t('requisitions.articles.search')}
                  style={{ ...champ, width: isMobile ? '100%' : '240px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: c.texteMuted, cursor: 'pointer' }}>
                  <input type="checkbox" checked={voirInactifs} onChange={(e) => setVoirInactifs(e.target.checked)} />
                  {t('requisitions.articles.showInactive')}
                </label>
              </div>

              {!modifiable && (
                <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>{t('requisitions.articles.readOnly')}</div>
              )}

              {visibles.length === 0 ? (
                <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>
                  {duService.length === 0 ? t('requisitions.articles.empty') : t('requisitions.articles.noMatch')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {visibles.map((a) => (
                    <div key={a.id} style={{ border: `0.5px solid ${c.bordure}`, borderRadius: '10px', padding: '10px 12px', opacity: a.actif ? 1 : 0.6 }}>
                      {edition?.id === a.id ? (
                        <>
                          {champsArticle(edition, setEdition)}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button onClick={enregistrer} disabled={occupe || !edition.nom.trim()} style={boutonPrincipal(!occupe && !!edition.nom.trim())}>{t('requisitions.articles.save')}</button>
                            <button onClick={() => setEdition(null)} style={boutonSecondaire}>{t('requisitions.articles.cancel')}</button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', fontSize: '13px', color: c.texte }}>
                          <span style={{ fontWeight: '500', flex: '1 1 200px' }}>
                            {a.nom}
                            {a.reference && <span style={{ color: c.texteMuted, fontWeight: 400 }}> · {a.reference}</span>}
                          </span>
                          {a.categorie && <span style={{ fontSize: '11px', background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '2px 10px' }}>{a.categorie}</span>}
                          <span style={{ color: c.texteMuted, minWidth: '120px', textAlign: 'right' }}>
                            {formatPrix(a.prix_unitaire)} / {a.unite}
                          </span>
                          {!a.actif && <span style={{ fontSize: '11px', background: c.orangeClair, color: c.orange, borderRadius: '20px', padding: '2px 10px' }}>{t('requisitions.articles.inactive')}</span>}
                          {modifiable && (
                            <span style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => setEdition({ ...a, categorie: a.categorie || '', reference: a.reference || '', prix_unitaire: a.prix_unitaire ?? '' })} style={boutonSecondaire}>{t('requisitions.articles.edit')}</button>
                              <button onClick={() => basculerActif(a)} disabled={occupe} style={boutonSecondaire}>
                                {a.actif ? t('requisitions.articles.deactivate') : t('requisitions.articles.activate')}
                              </button>
                              <button onClick={() => supprimer(a)} disabled={occupe} style={{ ...boutonSecondaire, color: c.rouge, borderColor: c.rougeClair }}>{t('requisitions.articles.delete')}</button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
