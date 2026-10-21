'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../lib/supabase'
import { appelApiRequisitions as appelApi } from '../../lib/requisitions/apiClient'
import { useTheme } from '../../lib/useTheme'
import { usePermissions } from '../../lib/usePermissions'
import { texteSurAccent } from '../../lib/theme.jsx'
import EmojiPicker from '../EmojiPicker'
import ChefLoader from '../ChefLoader'

// Paramètres › Services : services internes qui passent et préparent les
// réquisitions (aucun nom en dur), leurs membres et le réglage de validation.
// Lecture et écriture via /api/requisitions/services* (guard administration).

const STOCKS = ['cuisine', 'bar', 'articles', 'aucun']

const SERVICE_VIDE = { nom: '', emoji: '🛎️', peut_demander: true, peut_preparer: false, stock: 'aucun' }

export default function ServicesEditor() {
  const { t } = useTranslation()
  const { c } = useTheme()
  const { peutModifier } = usePermissions()
  const modifiable = peutModifier('administration')
  const surAccent = texteSurAccent(c)

  const [clientId, setClientId] = useState(null)
  const [services, setServices] = useState([])
  const [membres, setMembres] = useState([])
  const [utilisateurs, setUtilisateurs] = useState([])
  const [validation, setValidation] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState(null)

  const [nouveau, setNouveau] = useState(SERVICE_VIDE)
  const [edition, setEdition] = useState(null)      // { id, ...champs }
  const [membresOuvert, setMembresOuvert] = useState(null) // service_id
  const [selection, setSelection] = useState({})    // user_id → { responsable }

  const afficher = (texte, type = 'success') => {
    setMessage({ texte, type })
    setTimeout(() => setMessage(null), 3500)
  }

  // Lecture seule (sans setState) : réutilisée au montage et après chaque action.
  const recuperer = useCallback(async () => {
    const id = await getClientId()
    if (!id) return { id: null }
    const d = await appelApi(`/api/requisitions/services?client_id=${encodeURIComponent(id)}`)
    return { id, d }
  }, [])

  const appliquer = useCallback(({ id, d }) => {
    setClientId(id)
    if (d) {
      setServices(d.services || [])
      setMembres(d.membres || [])
      setUtilisateurs(d.utilisateurs || [])
      setValidation(!!d.validation)
    }
    setChargement(false)
  }, [])

  const echec = useCallback((e) => {
    setChargement(false)
    afficher(e?.message || t('requisitions.services.loadError'), 'error')
  }, [t])

  const charger = useCallback(() => recuperer().then(appliquer).catch(echec), [recuperer, appliquer, echec])

  useEffect(() => {
    let annule = false
    recuperer()
      .then((r) => { if (!annule) appliquer(r) })
      .catch((e) => { if (!annule) echec(e) })
    return () => { annule = true }
  }, [recuperer, appliquer, echec])

  const membresParService = useMemo(() => {
    const m = new Map()
    for (const x of membres) {
      if (!m.has(x.service_id)) m.set(x.service_id, [])
      m.get(x.service_id).push(x)
    }
    return m
  }, [membres])

  const nomUtilisateur = (u) => u?.nom || u?.email || '—'

  const executer = async (fn, succes) => {
    setOccupe(true)
    try {
      await fn()
      if (succes) afficher(succes)
      await charger()
      return true
    } catch (e) {
      afficher(e.message, 'error')
      return false
    } finally {
      setOccupe(false)
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const creer = async () => {
    if (!nouveau.nom.trim()) return
    const ok = await executer(
      () => appelApi('/api/requisitions/services', { method: 'POST', body: { client_id: clientId, ...nouveau } }),
      t('requisitions.services.created', { nom: nouveau.nom.trim() }),
    )
    if (ok) setNouveau(SERVICE_VIDE)
  }

  const enregistrerEdition = async () => {
    if (!edition) return
    const { id, nom, emoji, peut_demander, peut_preparer, stock } = edition
    const ok = await executer(
      () => appelApi('/api/requisitions/services', { method: 'PATCH', body: { client_id: clientId, id, nom, emoji, peut_demander, peut_preparer, stock } }),
      t('requisitions.services.updated'),
    )
    if (ok) setEdition(null)
  }

  const basculerActif = (s) => executer(
    () => appelApi('/api/requisitions/services', { method: 'PATCH', body: { client_id: clientId, id: s.id, actif: !s.actif } }),
    s.actif ? t('requisitions.services.deactivated', { nom: s.nom }) : t('requisitions.services.activated', { nom: s.nom }),
  )

  const supprimer = (s) => {
    if (!window.confirm(t('requisitions.services.confirmDelete', { nom: s.nom }))) return
    executer(
      () => appelApi('/api/requisitions/services', { method: 'DELETE', body: { client_id: clientId, id: s.id } }),
      t('requisitions.services.deleted', { nom: s.nom }),
    )
  }

  const deplacer = (index, sens) => {
    const cible = index + sens
    if (cible < 0 || cible >= services.length) return
    const ids = services.map((s) => s.id)
    ;[ids[index], ids[cible]] = [ids[cible], ids[index]]
    executer(() => appelApi('/api/requisitions/services/ordre', { method: 'PUT', body: { client_id: clientId, ids } }))
  }

  const ouvrirMembres = (s) => {
    if (membresOuvert === s.id) { setMembresOuvert(null); return }
    const sel = {}
    for (const m of membresParService.get(s.id) || []) sel[m.user_id] = { responsable: !!m.responsable }
    setSelection(sel)
    setMembresOuvert(s.id)
  }

  const enregistrerMembres = async () => {
    const liste = Object.entries(selection).map(([user_id, v]) => ({ user_id, responsable: !!v.responsable }))
    const ok = await executer(
      () => appelApi('/api/requisitions/services/membres', { method: 'PUT', body: { client_id: clientId, service_id: membresOuvert, membres: liste } }),
      t('requisitions.services.membersSaved'),
    )
    if (ok) setMembresOuvert(null)
  }

  const basculerValidation = () => {
    const v = !validation
    executer(
      () => appelApi('/api/requisitions/parametres', { method: 'PATCH', body: { client_id: clientId, validation: v } }),
      v ? t('requisitions.services.validationOn') : t('requisitions.services.validationOff'),
    )
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (chargement) return <ChefLoader />

  const carte = { background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}` }
  const titreCarte = { fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }
  const champ = { padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc }
  const label = { fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }
  const boutonPrincipal = (actif = true) => ({
    padding: '9px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '500',
    background: actif ? c.accent : c.bordure, color: actif ? surAccent : c.texteMuted, cursor: actif ? 'pointer' : 'not-allowed',
  })
  const boutonSecondaire = { padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: 'transparent', color: c.texte, fontSize: '12px', cursor: 'pointer' }
  const badge = (fond, couleur) => ({ fontSize: '11px', background: fond, color: couleur, borderRadius: '20px', padding: '2px 10px', whiteSpace: 'nowrap' })

  // Champs communs à la création et à l'édition. Fonction appelée (et non
  // composant) : un composant déclaré dans le rendu serait remonté à chaque
  // frappe et l'input perdrait le focus.
  const champsService = (valeur, onChange) => (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
        <div style={{ flexShrink: 0 }}>
          <label style={label}>{t('requisitions.services.emoji')}</label>
          <EmojiPicker value={valeur.emoji || ''} onChange={(e) => onChange({ ...valeur, emoji: e })} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>{t('requisitions.services.name')} *</label>
          <input type="text" value={valeur.nom} maxLength={80}
            onChange={(e) => onChange({ ...valeur, nom: e.target.value })}
            placeholder={t('requisitions.services.namePlaceholder')}
            style={{ ...champ, width: '100%' }} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>{t('requisitions.services.stock')}</label>
          <select value={valeur.stock} onChange={(e) => onChange({ ...valeur, stock: e.target.value })} style={{ ...champ, width: '100%' }}>
            {STOCKS.map((s) => (
              <option key={s} value={s} disabled={s === 'aucun' && valeur.peut_preparer}>{t(`requisitions.services.stocks.${s}`)}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', marginTop: '12px', fontSize: '13px', color: c.texte }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={valeur.peut_demander}
            onChange={(e) => onChange({ ...valeur, peut_demander: e.target.checked })} />
          {t('requisitions.services.canRequest')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={valeur.peut_preparer}
            onChange={(e) => onChange({
              ...valeur,
              peut_preparer: e.target.checked,
              // Un service qui prépare sort d'un stock : on propose la cuisine par défaut.
              stock: e.target.checked && valeur.stock === 'aucun' ? 'cuisine' : valeur.stock,
            })} />
          {t('requisitions.services.canPrepare')}
        </label>
      </div>
      {!valeur.peut_demander && !valeur.peut_preparer && (
        <div style={{ fontSize: '12px', color: c.rouge, marginTop: '8px' }}>{t('requisitions.services.needRole')}</div>
      )}
    </>
  )

  const valide = (v) => v.nom.trim() && (v.peut_demander || v.peut_preparer) && !(v.peut_preparer && v.stock === 'aucun')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {message && (
        <div role="status" style={{
          padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
          background: message.type === 'success' ? c.vertClair : c.rougeClair,
          color: message.type === 'success' ? c.vert : c.rouge,
        }}>{message.texte}</div>
      )}

      <div style={{ fontSize: '13px', color: c.texteMuted, lineHeight: 1.5 }}>{t('requisitions.services.intro')}</div>

      {/* Réglage : validation obligatoire */}
      <div style={carte}>
        <div style={titreCarte}>{t('requisitions.services.validationTitle')}</div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: modifiable ? 'pointer' : 'default', fontSize: '13px', color: c.texte }}>
          <input type="checkbox" checked={validation} disabled={!modifiable || occupe} onChange={basculerValidation} style={{ marginTop: '2px' }} />
          <span>
            {t('requisitions.services.validationLabel')}
            <span style={{ display: 'block', fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>{t('requisitions.services.validationHelp')}</span>
          </span>
        </label>
      </div>

      {/* Nouveau service */}
      {modifiable && (
        <div style={carte}>
          <div style={titreCarte}>{t('requisitions.services.newTitle')}</div>
          {champsService(nouveau, setNouveau)}
          <div style={{ marginTop: '14px' }}>
            <button onClick={creer} disabled={occupe || !valide(nouveau)} style={boutonPrincipal(!occupe && valide(nouveau))}>
              + {t('requisitions.services.add')}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={carte}>
        <div style={titreCarte}>{t('requisitions.services.listTitle', { count: services.length })}</div>
        {services.length === 0 && (
          <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', padding: '8px' }}>{t('requisitions.services.empty')}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {services.map((s, i) => {
            const ms = membresParService.get(s.id) || []
            const enEdition = edition?.id === s.id
            return (
              <div key={s.id} style={{ border: `0.5px solid ${c.bordure}`, borderRadius: '10px', padding: '12px 14px', opacity: s.actif ? 1 : 0.6 }}>
                {enEdition ? (
                  <>
                    {champsService(edition, setEdition)}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button onClick={enregistrerEdition} disabled={occupe || !valide(edition)} style={boutonPrincipal(!occupe && valide(edition))}>{t('requisitions.services.save')}</button>
                      <button onClick={() => setEdition(null)} style={boutonSecondaire}>{t('requisitions.services.cancel')}</button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{s.emoji || '🛎️'}</span>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte, marginRight: '4px' }}>{s.nom}</span>
                    {s.peut_demander && <span style={badge(c.accentClair, c.accent)}>{t('requisitions.services.badgeRequests')}</span>}
                    {s.peut_preparer && <span style={badge(c.vertClair, c.vert)}>{t('requisitions.services.badgePrepares')}</span>}
                    {s.stock !== 'aucun' && <span style={badge(c.fond, c.texteMuted)}>{t(`requisitions.services.stocks.${s.stock}`)}</span>}
                    {!s.actif && <span style={badge(c.orangeClair, c.orange)}>{t('requisitions.services.inactive')}</span>}
                    <span style={{ flex: '1 1 auto' }} />
                    <button onClick={() => ouvrirMembres(s)} style={boutonSecondaire}>
                      👥 {t('requisitions.services.members', { count: ms.length })}
                    </button>
                    {modifiable && (
                      <>
                        <button onClick={() => deplacer(i, -1)} disabled={occupe || i === 0} aria-label={t('requisitions.services.moveUp')} style={boutonSecondaire}>↑</button>
                        <button onClick={() => deplacer(i, 1)} disabled={occupe || i === services.length - 1} aria-label={t('requisitions.services.moveDown')} style={boutonSecondaire}>↓</button>
                        <button onClick={() => setEdition({ ...s, emoji: s.emoji || '' })} style={boutonSecondaire}>{t('requisitions.services.edit')}</button>
                        <button onClick={() => basculerActif(s)} disabled={occupe} style={boutonSecondaire}>
                          {s.actif ? t('requisitions.services.deactivate') : t('requisitions.services.activate')}
                        </button>
                        <button onClick={() => supprimer(s)} disabled={occupe} style={{ ...boutonSecondaire, color: c.rouge, borderColor: c.rougeClair }}>
                          {t('requisitions.services.delete')}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Membres */}
                {membresOuvert === s.id && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `0.5px solid ${c.bordure}` }}>
                    <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '10px' }}>{t('requisitions.services.membersHelp')}</div>
                    {utilisateurs.length === 0 && (
                      <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.services.noUsers')}</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {utilisateurs.map((u) => {
                        const coche = !!selection[u.user_id]
                        return (
                          <div key={u.user_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '13px', color: c.texte }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 220px', cursor: modifiable ? 'pointer' : 'default' }}>
                              <input type="checkbox" checked={coche} disabled={!modifiable}
                                onChange={(e) => setSelection((sel) => {
                                  const n = { ...sel }
                                  if (e.target.checked) n[u.user_id] = { responsable: false }
                                  else delete n[u.user_id]
                                  return n
                                })} />
                              {nomUtilisateur(u)}
                              {u.role && <span style={{ fontSize: '11px', color: c.texteMuted }}>· {t(`admin.users.roles.${u.role}`, { defaultValue: u.role })}</span>}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: coche ? c.texte : c.texteMuted, cursor: modifiable && coche ? 'pointer' : 'default' }}>
                              <input type="checkbox" checked={!!selection[u.user_id]?.responsable} disabled={!modifiable || !coche}
                                onChange={(e) => setSelection((sel) => ({ ...sel, [u.user_id]: { responsable: e.target.checked } }))} />
                              {t('requisitions.services.manager')}
                            </label>
                          </div>
                        )
                      })}
                    </div>
                    {modifiable && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button onClick={enregistrerMembres} disabled={occupe} style={boutonPrincipal(!occupe)}>{t('requisitions.services.saveMembers')}</button>
                        <button onClick={() => setMembresOuvert(null)} style={boutonSecondaire}>{t('requisitions.services.cancel')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
