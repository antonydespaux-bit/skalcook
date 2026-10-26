'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../lib/supabase'
import { crmPerimetre } from '../../../lib/crmPerimetre'
import { useTheme } from '../../../lib/useTheme'
import { texteSurAccent } from '../../../lib/theme'
import { usePermissions } from '../../../lib/usePermissions'
import { log } from '../../../lib/useLog'
import Navbar from '../../../components/Navbar'
import { Button, Badge, Alert } from '../../../components/ui'
import { clientDisplayName, hexToRgba, formatDateFr } from '../../../lib/crmConstants'
import { buildClientsWorkbook, nomFichierClients, estContactable } from '../../../lib/crmExport'

// Liste des clients CRM (≈ 40 000 fiches avec TheFork) : filtres, tri et
// pagination faits par la base (fonction crm_clients_recherche), chargement
// par lots de PAGE au fil du défilement.

const PAGE = 100
const LOT_EXPORT = 1000

const TRIS = [
  { id: 'creation', label: 'Date de création' },
  { id: 'nom', label: 'Nom' },
  { id: 'derniere_visite', label: 'Dernière visite' },
  { id: 'visites', label: 'Nombre de visites' },
  { id: 'prochaine', label: 'Prochaine réservation' },
]

const FILTRES_VIDES = { maisons: [], type: '', vip: false, perdu: false, contactable: '', prescripteur: false, tag: '' }

export default function CrmClientsPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { peutVoir, peutModifier, loading: permLoading } = usePermissions()

  const [authReady, setAuthReady] = useState(false)
  const [perimetre, setPerimetre] = useState(null)
  const [clients, setClients] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [chargementSuite, setChargementSuite] = useState(false)
  const [error, setError] = useState('')
  const [saisie, setSaisie] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState(FILTRES_VIDES)
  const [tri, setTri] = useState('creation')
  const [desc, setDesc] = useState(true)
  const [tagsDispo, setTagsDispo] = useState([])
  const [exportOuvert, setExportOuvert] = useState(false)
  const [exportContactables, setExportContactables] = useState(true)
  const [exportEnCours, setExportEnCours] = useState('')
  const [voirHaut, setVoirHaut] = useState(false)
  const fin = useRef(null)
  const requete = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      setAuthReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!permLoading && !peutVoir('crm')) {
      router.replace('/dashboard')
    }
  }, [peutVoir, permLoading, router])

  // Périmètre (maisons du groupe, seuils VIP / perdu) et tags existants
  useEffect(() => {
    if (!authReady || !peutVoir('crm')) return
    ;(async () => {
      const cid = await getClientId()
      if (!cid) { setLoading(false); return }
      const p = await crmPerimetre(cid)
      setPerimetre(p)
      const { data } = await supabase.from('crm_clients').select('tags').in('client_id', p.ids).neq('tags', '{}').limit(1000)
      setTagsDispo([...new Set((data || []).flatMap((r) => r.tags || []))].sort())
    })()
  }, [authReady, peutVoir])

  // Recherche saisie : attendre une pause de frappe
  useEffect(() => {
    const t = setTimeout(() => setRecherche(saisie.trim()), 350)
    return () => clearTimeout(t)
  }, [saisie])

  const parametres = useCallback((f, extra = {}) => ({
    p_ids: perimetre.ids,
    p_recherche: recherche || null,
    p_maisons: f.maisons.length ? f.maisons : null,
    p_type: f.type || null,
    p_vip: f.vip || null,
    p_perdu: f.perdu || null,
    p_contactable: f.contactable === '' ? null : f.contactable === 'oui',
    p_prescripteur: f.prescripteur || null,
    p_tag: f.tag || null,
    p_vip_visites: perimetre.seuils?.vipVisites || 5,
    p_vip_mois: perimetre.seuils?.vipMois || 12,
    p_perdu_mois: perimetre.seuils?.perduMois || 6,
    p_tri: tri,
    p_desc: desc,
    ...extra,
  }), [perimetre, recherche, tri, desc])

  const charger = useCallback(async (offset) => {
    if (!perimetre) return
    const n = ++requete.current
    if (offset === 0) setLoading(true)
    else setChargementSuite(true)
    setError('')
    const { data, error: err } = await supabase.rpc('crm_clients_recherche', parametres(filtres, { p_limit: PAGE, p_offset: offset }))
    if (n !== requete.current) return // une recherche plus récente a été lancée
    if (err) setError(err.message)
    else {
      // La liste peut bouger entre deux lots (import en cours) : pas de doublon
      setClients((prev) => {
        if (offset === 0) return data || []
        const vus = new Set(prev.map((x) => x.id))
        return [...prev, ...(data || []).filter((x) => !vus.has(x.id))]
      })
      setTotal(data?.[0]?.total ? Number(data[0].total) : offset === 0 ? 0 : total)
    }
    setLoading(false)
    setChargementSuite(false)
  }, [perimetre, parametres, filtres, total])

  useEffect(() => { charger(0) }, [perimetre, recherche, filtres, tri, desc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lot suivant quand le bas de la liste devient visible
  useEffect(() => {
    const el = fin.current
    if (!el) return
    const obs = new IntersectionObserver((entrees) => {
      if (entrees[0].isIntersecting && !loading && !chargementSuite && clients.length < total) charger(clients.length)
    }, { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [charger, clients.length, total, loading, chargementSuite])

  // Flèche « haut de page »
  useEffect(() => {
    const surDefilement = () => setVoirHaut(window.scrollY > 600)
    window.addEventListener('scroll', surDefilement, { passive: true })
    return () => window.removeEventListener('scroll', surDefilement)
  }, [])

  const maisonsListe = useMemo(() => Object.entries(perimetre?.maisons || {}), [perimetre])
  const nomMaisons = perimetre?.partage ? perimetre.maisons : {}
  const nbFiltres = filtres.maisons.length + ['type', 'contactable', 'tag'].filter((k) => filtres[k]).length
    + ['vip', 'perdu', 'prescripteur'].filter((k) => filtres[k]).length
  const maj = (patch) => setFiltres((f) => ({ ...f, ...patch }))

  const libelleFiltres = (f) => [
    recherche && `recherche « ${recherche} »`,
    f.maisons.length && `maisons : ${f.maisons.map((id) => perimetre.maisons[id]).join(', ')}`,
    f.type && (f.type === 'entreprise' ? 'entreprises' : 'particuliers'),
    f.vip && 'VIP', f.perdu && 'à relancer', f.prescripteur && 'prescripteurs',
    f.contactable && (f.contactable === 'oui' ? 'contactables' : 'non contactables'),
    f.tag && `tag ${f.tag}`,
  ].filter(Boolean).join(' · ')

  async function exporter() {
    const f = exportContactables ? { ...filtres, contactable: 'oui' } : filtres
    const lignes = []
    try {
      for (let offset = 0; ; offset += LOT_EXPORT) {
        setExportEnCours(`Préparation… ${lignes.length} client(s)`)
        const { data, error: err } = await supabase.rpc('crm_clients_recherche', parametres(f, { p_limit: LOT_EXPORT, p_offset: offset }))
        if (err) throw err
        lignes.push(...(data || []))
        if (!data || data.length < LOT_EXPORT) break
      }
      const libelle = libelleFiltres(f)
      XLSX.writeFile(buildClientsWorkbook(lignes, perimetre.maisons, { filtres: libelle }), nomFichierClients())
      await log({
        action: 'EXPORT', entite: 'crm_clients', entite_nom: `${lignes.length} client(s)`, section: 'admin',
        details: { filtres: libelle || 'aucun', contactables_uniquement: exportContactables, lignes: lignes.length },
      })
      setExportOuvert(false)
    } catch (err) {
      setError(`Export impossible : ${err.message}`)
    } finally {
      setExportEnCours('')
    }
  }

  if (!authReady || permLoading) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const champ = { background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }
  const puce = (actif) => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    border: `0.5px solid ${actif ? c.accent : c.bordure}`, background: actif ? hexToRgba(c.accent || '#6366F1', 0.12) : c.blanc,
    color: actif ? (c.accent || '#6366F1') : c.texte,
  })

  return (
    <div style={{ background: c.fond, minHeight: '100vh' }}>
      <Navbar section="cuisine" />
      <div className="crm-page">
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Clients</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              {loading ? 'Chargement…' : `${total.toLocaleString('fr-FR')} client${total > 1 ? 's' : ''}${nbFiltres || recherche ? ' (filtrés)' : ''}`}
            </p>
          </div>
          <div className="crm-actions">
            {peutModifier('crm') && (
              <Button c={c} variant="ghost" onClick={() => setExportOuvert((o) => !o)}>Exporter en Excel</Button>
            )}
            <Button c={c} onClick={() => router.push('/crm/clients/nouveau')}>+ Nouveau client</Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {exportOuvert && (
          <div style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.texte, marginBottom: 8 }}>Exporter les clients affichés</div>
            <div style={{ fontSize: 13, color: c.texteMuted, marginBottom: 10 }}>
              Filtres appliqués : {libelleFiltres(filtres) || 'aucun'}. L’export est noté dans le journal d’activité.
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: c.texte, marginBottom: 10 }}>
              <input type="checkbox" checked={exportContactables} onChange={(e) => setExportContactables(e.target.checked)} />
              Uniquement les clients contactables (accord de prospection, pas de désinscription)
            </label>
            <div style={{ fontSize: 12, color: '#B45309', marginBottom: 12 }}>
              Fichier de données personnelles : ne pas le transférer, le supprimer après usage.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button c={c} onClick={exporter} disabled={!!exportEnCours}>{exportEnCours || 'Télécharger le fichier Excel'}</Button>
              <Button c={c} variant="ghost" onClick={() => setExportOuvert(false)}>Annuler</Button>
            </div>
          </div>
        )}

        <div className="crm-toolbar" style={{ flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Rechercher : nom, e-mail, téléphone, ville…"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            className="crm-toolbar__search"
            style={champ}
          />
          <select value={tri} onChange={(e) => setTri(e.target.value)} className="sk-select" style={champ} aria-label="Trier par">
            {TRIS.map((t) => <option key={t.id} value={t.id}>Trier : {t.label}</option>)}
          </select>
          {tri !== 'prochaine' && (
            <button type="button" onClick={() => setDesc((d) => !d)} className="sk-select" style={{ ...champ, cursor: 'pointer' }}
              title={desc ? 'Ordre décroissant' : 'Ordre croissant'}>
              {desc ? '↓ Décroissant' : '↑ Croissant'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          {maisonsListe.length > 1 && maisonsListe.map(([id, nom]) => (
            <button key={id} type="button" style={puce(filtres.maisons.includes(id))}
              onClick={() => maj({ maisons: filtres.maisons.includes(id) ? filtres.maisons.filter((x) => x !== id) : [...filtres.maisons, id] })}>
              {nom}
            </button>
          ))}
          <button type="button" style={puce(filtres.vip)} onClick={() => maj({ vip: !filtres.vip })}>★ VIP</button>
          <button type="button" style={puce(filtres.perdu)} onClick={() => maj({ perdu: !filtres.perdu })}>À relancer</button>
          <button type="button" style={puce(filtres.prescripteur)} onClick={() => maj({ prescripteur: !filtres.prescripteur })}>Prescripteurs</button>
          <select value={filtres.contactable} onChange={(e) => maj({ contactable: e.target.value })} className="sk-select" style={champ}>
            <option value="">Contactables et non contactables</option>
            <option value="oui">Contactables</option>
            <option value="non">Non contactables</option>
          </select>
          <select value={filtres.type} onChange={(e) => maj({ type: e.target.value })} className="sk-select" style={champ}>
            <option value="">Tous les types</option>
            <option value="particulier">Particuliers</option>
            <option value="entreprise">Entreprises</option>
          </select>
          {tagsDispo.length > 0 && (
            <select value={filtres.tag} onChange={(e) => maj({ tag: e.target.value })} className="sk-select" style={champ}>
              <option value="">Tous les tags</option>
              {tagsDispo.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {(nbFiltres > 0 || saisie) && (
            <button type="button" style={{ ...puce(false), color: c.texteMuted }} onClick={() => { setFiltres(FILTRES_VIDES); setSaisie('') }}>
              Effacer les filtres
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : clients.length === 0 ? (
          <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
            <div className="crm-empty__title" style={{ color: c.texte }}>
              {nbFiltres || recherche ? 'Aucun résultat' : 'Aucun client pour le moment'}
            </div>
            <div className="crm-empty__text" style={{ color: c.texteMuted }}>
              {nbFiltres || recherche
                ? 'Essayez d’ajuster vos filtres ou votre recherche.'
                : 'Ajoutez votre premier client pour commencer à suivre vos prospects.'}
            </div>
          </div>
        ) : (
          <div className="crm-list">
            {clients.map((cl) => (
              <button
                key={cl.id}
                type="button"
                onClick={() => router.push(`/crm/clients/${cl.id}`)}
                className="crm-row"
                style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
              >
                <div>
                  <div className="crm-row__primary" style={{ color: c.texte }}>
                    {clientDisplayName(cl)}
                  </div>
                  <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                    {cl.email || cl.telephone || '—'}{cl.ville ? ` · ${cl.ville}` : ''}
                  </div>
                </div>
                <div className="crm-row__meta">
                  {nomMaisons[cl.client_id] && (
                    <Badge bg={hexToRgba('#71717A', 0.10)} color={c.texteMuted} size="sm">{nomMaisons[cl.client_id]}</Badge>
                  )}
                  {cl.vip && <Badge bg={hexToRgba('#D97706', 0.14)} color="#B45309" size="sm">★ VIP</Badge>}
                  {cl.perdu && <Badge bg={hexToRgba('#DC2626', 0.12)} color="#B91C1C" size="sm">À relancer</Badge>}
                  {cl.prescripteur && <Badge bg={hexToRgba('#6366F1', 0.12)} color="#4338CA" size="sm">Prescripteur</Badge>}
                  {estContactable(cl)
                    ? <Badge bg={hexToRgba('#10B981', 0.12)} color="#047857" size="sm">Contactable</Badge>
                    : cl.desinscrit_at && <Badge bg={hexToRgba('#71717A', 0.12)} color={c.texteMuted} size="sm">Désinscrit</Badge>}
                  {cl.type === 'entreprise' && <Badge bg={hexToRgba('#6366F1', 0.12)} color="#6366F1" size="sm">Entreprise</Badge>}
                  {(cl.tags || []).slice(0, 2).map((t) => (
                    <Badge key={t} bg={hexToRgba(c.accent || '#6366F1', 0.10)} color={c.accent || '#6366F1'} size="sm">{t}</Badge>
                  ))}
                </div>
                <div className="crm-row__secondary" style={{ color: c.texteMuted, fontSize: 11 }}>
                  {Number(cl.visites) > 0
                    ? `${cl.visites} visite${cl.visites > 1 ? 's' : ''} · dernière ${formatDateFr(cl.derniere_visite)}`
                    : `Créé ${formatDateFr(cl.created_at)}`}
                  {cl.prochaine_reservation && <div>Prochaine : {formatDateFr(cl.prochaine_reservation)}</div>}
                </div>
              </button>
            ))}
            <div ref={fin} style={{ padding: 16, textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>
              {chargementSuite ? 'Chargement…' : clients.length < total
                ? <Button c={c} variant="ghost" size="sm" onClick={() => charger(clients.length)}>Afficher plus ({clients.length.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')})</Button>
                : total > PAGE ? `${total.toLocaleString('fr-FR')} clients affichés` : null}
            </div>
          </div>
        )}
      </div>

      {voirHaut && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Revenir en haut de la page"
          title="Revenir en haut"
          style={{
            position: 'fixed', right: 20, bottom: 24, width: 46, height: 46, borderRadius: '50%', border: 'none',
            background: c.accent || '#6366F1', color: texteSurAccent(c), fontSize: 20, cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)', zIndex: 50,
          }}
        >
          ↑
        </button>
      )}
    </div>
  )
}
