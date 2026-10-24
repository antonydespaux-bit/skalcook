'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { isSuperadminEmail } from '../../../lib/superadmin'
import ChefLoader from '../../../components/ChefLoader'

// Superadmin › TheFork : réglages du CRM de groupe alimenté par TheFork
// (identifiant de groupe TheFork, rattachement des restaurants aux
// établissements, seuils VIP / client perdu) et lancement de la
// synchronisation. Les identifiants API restent dans Vercel
// (THEFORK_CLIENT_ID / THEFORK_CLIENT_SECRET).

const carte = { background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '20px', marginBottom: '16px' }
const titre = { fontSize: '15px', fontWeight: 600, color: '#18181B', marginBottom: '14px' }
const label = { fontSize: '11px', fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }
const champ = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', outline: 'none', fontFamily: 'inherit', color: '#18181B', background: '#FAFAFA' }
const bouton = (couleur = '#6366F1', actif = true) => ({
  padding: '9px 14px', borderRadius: '8px', border: 'none', background: actif ? couleur : '#A1A1AA',
  color: 'white', fontSize: '13px', fontWeight: 600, cursor: actif ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
})

async function appel(methode, corps) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = methode === 'GET' ? `/api/superadmin/thefork-sync?groupe_id=${corps.groupe_id}` : '/api/superadmin/thefork-sync'
  const res = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: methode === 'GET' ? undefined : JSON.stringify(corps),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok && !json?.clients_lus) throw new Error(json?.error || `Erreur ${res.status}`)
  return json
}

export default function TheForkSuperadminPage() {
  const router = useRouter()
  const [autorise, setAutorise] = useState(false)
  const [groupes, setGroupes] = useState([])
  const [groupeId, setGroupeId] = useState('')
  const [etat, setEtat] = useState(null)
  const [form, setForm] = useState({ thefork_group_uuid: '', import_depuis: '', actif: true, crm_vip_visites: 5, crm_vip_mois: 12, crm_perdu_mois: 6 })
  const [restos, setRestos] = useState([])
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      let ok = isSuperadminEmail((session.user.email || '').toLowerCase().trim())
      if (!ok) {
        const { data: p } = await supabase.from('profils').select('is_superadmin').eq('id', session.user.id).single()
        ok = !!p?.is_superadmin
      }
      if (!ok) { router.push('/dashboard'); return }
      setAutorise(true)
      const { data } = await supabase.from('groupes').select('id, nom').order('nom')
      setGroupes(data || [])
      if (data?.length === 1) setGroupeId(data[0].id)
    })()
  }, [router])

  const charger = useCallback(async () => {
    if (!groupeId) return
    setErreur('')
    try {
      const e = await appel('GET', { groupe_id: groupeId })
      setEtat(e)
      setForm({
        thefork_group_uuid: e.sync?.thefork_group_uuid || '',
        import_depuis: e.sync?.import_depuis || '',
        actif: e.sync?.actif ?? true,
        crm_vip_visites: e.groupe?.crm_vip_visites ?? 5,
        crm_vip_mois: e.groupe?.crm_vip_mois ?? 12,
        crm_perdu_mois: e.groupe?.crm_perdu_mois ?? 6,
      })
      setRestos(e.restaurants || [])
    } catch (err) { setErreur(err.message) }
  }, [groupeId])

  useEffect(() => { charger() }, [charger])

  const enregistrer = async (extra = {}) => {
    setOccupe(true); setErreur(''); setMessage('')
    try {
      await appel('PATCH', {
        groupe_id: groupeId,
        thefork_group_uuid: form.thefork_group_uuid || undefined,
        import_depuis: form.import_depuis || undefined,
        actif: form.actif,
        crm_vip_visites: Number(form.crm_vip_visites),
        crm_vip_mois: Number(form.crm_vip_mois),
        crm_perdu_mois: Number(form.crm_perdu_mois),
        restaurants: restos.map((r) => ({ restaurant_uuid: r.restaurant_uuid, client_id: r.client_id || null, nom: r.nom || null })),
        ...extra,
      })
      setMessage('Réglages enregistrés.')
      await charger()
    } catch (err) { setErreur(err.message) } finally { setOccupe(false) }
  }

  // Une passe, ou des passes successives jusqu'à la fin de l'import
  const synchroniser = async (jusquauBout) => {
    setOccupe(true); setErreur(''); setMessage('')
    try {
      for (let passe = 1; passe <= (jusquauBout ? 40 : 1); passe++) {
        setMessage(`Synchronisation en cours… (passe ${passe})`)
        const r = await appel('POST', { groupe_id: groupeId })
        if (r.erreur) { setErreur(r.erreur); break }
        setMessage(`Passe ${passe} : ${r.clients_crees} client(s) créé(s), ${r.clients_fusionnes} fusionné(s), ${r.reservations_ecrites} réservation(s). ${r.termine ? 'À jour.' : 'Il reste des données à importer.'}`)
        if (r.termine) break
      }
      await charger()
    } catch (err) { setErreur(err.message) } finally { setOccupe(false) }
  }

  if (!autorise) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}><ChefLoader /></div>
  )

  const r = etat?.sync?.dernier_resultat
  const nomEtab = (id) => {
    const e = etat?.etablissements?.find((x) => x.id === id)
    return e ? (e.nom_etablissement || e.nom) : ''
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F5' }}>
      <div style={{ background: '#18181B', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>Super Admin</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>TheFork · CRM groupe</span>
        </div>
        <button onClick={() => router.push('/superadmin')} style={{ background: 'rgba(99,102,241,0.2)', color: '#A5B4FC', border: '0.5px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>← Retour SuperAdmin</button>
      </div>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={carte}>
          <label style={label}>Groupe</label>
          <select value={groupeId} onChange={(e) => setGroupeId(e.target.value)} style={champ}>
            <option value="">Choisir un groupe…</option>
            {groupes.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}
          </select>
          {etat && !etat.identifiants && (
            <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', fontSize: '13px' }}>
              Identifiants TheFork absents : ajouter THEFORK_CLIENT_ID et THEFORK_CLIENT_SECRET dans Vercel.
            </div>
          )}
        </div>

        {erreur && <div style={{ ...carte, background: '#FEE2E2', color: '#B91C1C', fontSize: '13px' }}>{erreur}</div>}
        {message && <div style={{ ...carte, background: '#EEF2FF', color: '#3730A3', fontSize: '13px' }}>{message}</div>}

        {groupeId && etat && (
          <>
            <div style={carte}>
              <div style={titre}>Synchronisation</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={label}>Identifiant du groupe chez TheFork</label>
                  <input value={form.thefork_group_uuid} onChange={(e) => setForm({ ...form, thefork_group_uuid: e.target.value.trim() })} placeholder="8b64e390-…" style={champ} />
                </div>
                <div>
                  <label style={label}>Importer depuis</label>
                  <input type="date" value={form.import_depuis} onChange={(e) => setForm({ ...form, import_depuis: e.target.value })} style={champ} />
                </div>
                <div>
                  <label style={label}>Synchro de nuit</label>
                  <select value={form.actif ? '1' : '0'} onChange={(e) => setForm({ ...form, actif: e.target.value === '1' })} style={champ}>
                    <option value="1">Active</option>
                    <option value="0">En pause</option>
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: '#3F3F46', lineHeight: 1.7, marginBottom: '14px' }}>
                <div>Fiches TheFork : <b>{etat.compteurs.clients}</b> · Réservations : <b>{etat.compteurs.reservations}</b></div>
                <div>Dernière exécution : {etat.sync?.derniere_execution ? new Date(etat.sync.derniere_execution).toLocaleString('fr-FR') : 'jamais'}
                  {r && <> — {r.erreur ? <span style={{ color: '#B91C1C' }}>erreur : {r.erreur}</span> : r.termine ? 'à jour' : 'import en cours'}</>}
                </div>
                {etat.sync && <div>Avancement : clients jusqu’au {etat.sync.curseur_clients || '—'}, réservations jusqu’au {etat.sync.curseur_reservations || '—'}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => enregistrer()} disabled={occupe} style={bouton('#18181B', !occupe)}>Enregistrer</button>
                <button onClick={() => synchroniser(false)} disabled={occupe || !etat.sync || !etat.identifiants} style={bouton('#6366F1', !occupe && !!etat.sync && etat.identifiants)}>Synchroniser maintenant</button>
                <button onClick={() => synchroniser(true)} disabled={occupe || !etat.sync || !etat.identifiants} style={bouton('#16A34A', !occupe && !!etat.sync && etat.identifiants)}>Tout importer</button>
                <button onClick={() => { if (window.confirm('Relire tout depuis la date d’import ? Les fiches existantes sont mises à jour, rien n’est supprimé.')) enregistrer({ reinitialiser: true }) }} disabled={occupe || !etat.sync} style={bouton('#A1A1AA', !occupe && !!etat.sync)}>Repartir du début</button>
              </div>
            </div>

            <div style={carte}>
              <div style={titre}>Restaurants TheFork</div>
              {restos.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#71717A' }}>Les restaurants apparaissent ici après une première synchronisation. Rattachez chacun à son établissement.</div>
              ) : restos.map((resto, i) => (
                <div key={resto.restaurant_uuid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 0', borderTop: i ? '0.5px solid #F4F4F5' : 'none' }}>
                  <div>
                    <input value={resto.nom || ''} placeholder="Nom (pour s’y retrouver)" onChange={(e) => setRestos(restos.map((x) => x.restaurant_uuid === resto.restaurant_uuid ? { ...x, nom: e.target.value } : x))} style={champ} />
                    <div style={{ fontSize: '11px', color: '#A1A1AA', marginTop: '4px' }}>{resto.restaurant_uuid}</div>
                  </div>
                  <select value={resto.client_id || ''} onChange={(e) => setRestos(restos.map((x) => x.restaurant_uuid === resto.restaurant_uuid ? { ...x, client_id: e.target.value || null } : x))} style={{ ...champ, borderColor: resto.client_id ? '#E4E4E7' : '#F59E0B' }}>
                    <option value="">Non relié (réservations ignorées)</option>
                    {etat.etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom_etablissement || e.nom}</option>)}
                  </select>
                </div>
              ))}
              {restos.some((x) => !x.client_id) && (
                <div style={{ fontSize: '12px', color: '#B45309', marginTop: '8px' }}>Les réservations d’un restaurant non relié ne sont pas importées : choisissez son établissement puis Enregistrer et relancez.</div>
              )}
              {restos.length > 0 && <div style={{ fontSize: '12px', color: '#71717A', marginTop: '8px' }}>Établissements du groupe : {etat.etablissements.map((e) => nomEtab(e.id)).join(', ')}</div>}
            </div>

            <div style={carte}>
              <div style={titre}>Seuils du CRM</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={label}>VIP à partir de (visites)</label>
                  <input type="number" min="1" value={form.crm_vip_visites} onChange={(e) => setForm({ ...form, crm_vip_visites: e.target.value })} style={champ} />
                </div>
                <div>
                  <label style={label}>… sur (mois)</label>
                  <input type="number" min="1" value={form.crm_vip_mois} onChange={(e) => setForm({ ...form, crm_vip_mois: e.target.value })} style={champ} />
                </div>
                <div>
                  <label style={label}>Client perdu après (mois sans visite)</label>
                  <input type="number" min="1" value={form.crm_perdu_mois} onChange={(e) => setForm({ ...form, crm_perdu_mois: e.target.value })} style={champ} />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <button onClick={() => enregistrer()} disabled={occupe} style={bouton('#18181B', !occupe)}>Enregistrer les seuils</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
