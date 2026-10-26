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
// synchronisation. Chaque groupe a ses propres identifiants API TheFork :
// saisis ici, rangés chiffrés dans le Vault Supabase, jamais réaffichés.

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
  const [form, setForm] = useState({ thefork_group_uuid: '', import_depuis: '', actif: true, debit_par_seconde: 5, crm_vip_visites: 5, crm_vip_mois: 12, crm_perdu_mois: 6 })
  const [ident, setIdent] = useState({ client_id: '', client_secret: '' })
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
        import_depuis: e.sync?.import_depuis || '2024-01-01',
        actif: e.sync?.actif ?? true,
        debit_par_seconde: Number(e.sync?.debit_par_seconde) || 5,
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
        debit_par_seconde: Number(form.debit_par_seconde) || undefined,
        crm_vip_visites: Number(form.crm_vip_visites),
        crm_vip_mois: Number(form.crm_vip_mois),
        crm_perdu_mois: Number(form.crm_perdu_mois),
        restaurants: restos.map((r) => ({ restaurant_uuid: r.restaurant_uuid, client_id: r.client_id || null, lieu_id: r.lieu_id || null, nom: r.nom || null })),
        ...extra,
      })
      setMessage('Réglages enregistrés.')
      await charger()
    } catch (err) { setErreur(err.message) } finally { setOccupe(false) }
  }

  const enregistrerIdentifiants = async () => {
    setOccupe(true); setErreur(''); setMessage('')
    try {
      await appel('PATCH', { groupe_id: groupeId, client_id: ident.client_id.trim(), client_secret: ident.client_secret.trim() })
      setIdent({ client_id: '', client_secret: '' })
      setMessage('Identifiants enregistrés (chiffrés).')
      await charger()
    } catch (err) { setErreur(err.message) } finally { setOccupe(false) }
  }

  // Une passe, ou des passes successives jusqu'à la fin de l'import
  const synchroniser = async (jusquauBout) => {
    setOccupe(true); setErreur(''); setMessage('')
    try {
      // ≈ 45 s par passe ; l'import initial de 30 000 fiches en demande plusieurs
      // dizaines. Garder la page ouverte ; une coupure reprend au clic suivant.
      let echecs = 0
      for (let passe = 1; passe <= (jusquauBout ? 2000 : 1); passe++) {
        setMessage(`Synchronisation en cours… (passe ${passe})`)
        let r
        try {
          r = await appel('POST', { groupe_id: groupeId })
          echecs = 0
        } catch (err) {
          // Passe coupée par l'hébergeur (504) ou réseau : on attend puis on relance
          if (!jusquauBout || ++echecs > 5) throw err
          setMessage(`Passe ${passe} coupée (${err.message}), nouvelle tentative dans 10 s…`)
          await new Promise((ok) => setTimeout(ok, 10_000))
          continue
        }
        if (r.erreur) { setErreur(r.erreur); break }
        const incident = r.incident ? ` Dernière réponse de TheFork : ${r.incident.statut} (${r.incident.chemin}).` : ''
        const diag = r.pages_listees ? ` [${r.pages_listees} page(s) de liste lue(s), ${r.taille_page} par page, total annoncé ${r.dernier_total}]` : ''
        setMessage(`Passe ${passe}${diag} : ${r.listes_clients} client(s) et ${r.listes_reservations} réservation(s) listés ; ${r.clients_crees} créé(s), ${r.clients_fusionnes} fusionné(s), ${r.clients_maj} mis à jour, ${r.clients_supprimes} supprimé(s), ${r.reservations_ecrites} réservation(s). Reste en file : ${r.file_restante.clients} client(s), ${r.file_restante.reservations} réservation(s).${r.termine ? ' À jour.' : r.interrompu ? ' Passe interrompue, à relancer.' : ''}${incident}`)
        if (r.termine) break
      }
      await charger()
    } catch (err) { setErreur(err.message) } finally { setOccupe(false) }
  }

  if (!autorise) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}><ChefLoader /></div>
  )

  const r = etat?.sync?.dernier_resultat
  const pret = !!etat?.identifiants?.enregistres && !!etat?.sync?.thefork_group_uuid
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

        </div>

        {erreur && <div style={{ ...carte, background: '#FEE2E2', color: '#B91C1C', fontSize: '13px' }}>{erreur}</div>}
        {message && <div style={{ ...carte, background: '#EEF2FF', color: '#3730A3', fontSize: '13px' }}>{message}</div>}

        {groupeId && etat && (
          <>
            <div style={carte}>
              <div style={titre}>Identifiants API TheFork</div>
              <div style={{ fontSize: '13px', color: etat.identifiants.enregistres ? '#15803D' : '#B45309', marginBottom: '12px' }}>
                {etat.identifiants.enregistres
                  ? `Enregistrés le ${new Date(etat.identifiants.maj).toLocaleString('fr-FR')} (chiffrés, jamais réaffichés).`
                  : 'Aucun identifiant : collez le client_id et le client_secret envoyés par TheFork à ce groupe.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={label}>client_id</label>
                  <input value={ident.client_id} onChange={(e) => setIdent({ ...ident, client_id: e.target.value })} autoComplete="off" spellCheck={false} style={champ} />
                </div>
                <div>
                  <label style={label}>client_secret</label>
                  <input type="password" value={ident.client_secret} onChange={(e) => setIdent({ ...ident, client_secret: e.target.value })} autoComplete="new-password" spellCheck={false} style={champ} />
                </div>
              </div>
              <button onClick={enregistrerIdentifiants} disabled={occupe || !ident.client_id.trim() || !ident.client_secret.trim()} style={bouton('#18181B', !occupe && !!ident.client_id.trim() && !!ident.client_secret.trim())}>
                {etat.identifiants.enregistres ? 'Remplacer les identifiants' : 'Enregistrer les identifiants'}
              </button>
            </div>

            <div style={carte}>
              <div style={titre}>Synchronisation</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={label}>Identifiant du groupe chez TheFork</label>
                  <input value={form.thefork_group_uuid} onChange={(e) => setForm({ ...form, thefork_group_uuid: e.target.value.trim() })} placeholder="8b64e390-…" style={champ} />
                </div>
                <div>
                  <label style={label}>Réservations depuis</label>
                  <input type="date" value={form.import_depuis} onChange={(e) => setForm({ ...form, import_depuis: e.target.value })} style={champ} />
                </div>
                <div>
                  <label style={label}>Débit (requêtes / seconde)</label>
                  <input type="number" min="0.5" max="50" step="0.5" value={form.debit_par_seconde} onChange={(e) => setForm({ ...form, debit_par_seconde: e.target.value })} style={champ} />
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
                  {r && <> — {r.erreur ? <span style={{ color: '#B91C1C' }}>erreur : {r.erreur}</span> : r.termine ? 'à jour' : r.interrompu ? 'interrompue, à relancer' : 'import en cours'}</>}
                  {r?.incident && <span style={{ color: '#B45309' }}> (TheFork : {String(r.incident.statut)})</span>}
                </div>
                {etat.sync && <div>Lecture des listes : clients {etat.sync.curseur_clients || '—'}{etat.sync.page_clients > 1 ? ` (page ${etat.sync.page_clients})` : ''}, réservations {etat.sync.curseur_reservations || '—'}{etat.sync.page_reservations > 1 ? ` (page ${etat.sync.page_reservations})` : ''}</div>}
                {etat.file.length > 0 && (
                  <div>File d’attente : {['client', 'reservation'].map((t) => {
                    const n = (st) => etat.file.find((f) => f.type === t && f.statut === st)?.nombre || 0
                    return `${t === 'client' ? 'clients' : 'réservations'} ${n('a_traiter')} à traiter · ${n('traite')} traités · ${n('introuvable')} introuvables · ${n('erreur')} en erreur`
                  }).join(' — ')}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => enregistrer()} disabled={occupe} style={bouton('#18181B', !occupe)}>Enregistrer</button>
                <button onClick={() => synchroniser(false)} disabled={occupe || !pret} style={bouton('#6366F1', !occupe && pret)}>Synchroniser maintenant</button>
                <button onClick={() => synchroniser(true)} disabled={occupe || !pret} style={bouton('#16A34A', !occupe && pret)}>Tout importer</button>
                <button onClick={() => enregistrer({ relancer_erreurs: true })} disabled={occupe || !etat.sync} style={bouton('#D97706', !occupe && !!etat.sync)}>Relancer les erreurs</button>
                <button onClick={() => { if (window.confirm('Relire l’historique des réservations depuis la date choisie ? Les fiches existantes sont mises à jour, rien n’est supprimé.')) enregistrer({ reinitialiser: true }) }} disabled={occupe || !etat.sync} style={bouton('#A1A1AA', !occupe && !!etat.sync)}>Repartir du début</button>
              </div>
            </div>

            <div style={carte}>
              <div style={titre}>Restaurants TheFork</div>
              {restos.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#71717A' }}>Les restaurants apparaissent ici après une première synchronisation. Rattachez chacun à son établissement.</div>
              ) : restos.map((resto, i) => (
                <div key={resto.restaurant_uuid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '10px 0', borderTop: i ? '0.5px solid #F4F4F5' : 'none' }}>
                  <div>
                    <input value={resto.nom || ''} placeholder="Nom (pour s’y retrouver)" onChange={(e) => setRestos(restos.map((x) => x.restaurant_uuid === resto.restaurant_uuid ? { ...x, nom: e.target.value } : x))} style={champ} />
                    <div style={{ fontSize: '11px', color: '#A1A1AA', marginTop: '4px' }}>{resto.restaurant_uuid}</div>
                  </div>
                  <select value={resto.client_id || ''} onChange={(e) => setRestos(restos.map((x) => x.restaurant_uuid === resto.restaurant_uuid ? { ...x, client_id: e.target.value || null } : x))} style={{ ...champ, borderColor: resto.client_id ? '#E4E4E7' : '#F59E0B' }}>
                    <option value="">Non relié (réservations ignorées)</option>
                    {etat.etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom_etablissement || e.nom}</option>)}
                  </select>
                  <select value={resto.lieu_id || ''} title="Lieu affiché sur les réservations (ex. une salle sans établissement)" onChange={(e) => setRestos(restos.map((x) => x.restaurant_uuid === resto.restaurant_uuid ? { ...x, lieu_id: e.target.value || null } : x))} style={champ}>
                    <option value="">Lieu : celui de l’établissement</option>
                    {(etat.lieux || []).map((l) => <option key={l.id} value={l.id}>Lieu : {l.nom}</option>)}
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
