'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getClientId } from '../lib/supabase'

// Modale « Derniers achats » d'un ingrédient (cuisine ou bar) : les N
// dernières lignes de factures / BL rattachées à l'ingrédient, avec date,
// fournisseur, quantité et prix unitaire HT net de remise.
//
// `achats_lignes.ingredient_id` est polymorphe (ingredients / ingredients_bar)
// mais les UUID sont uniques, donc le filtre sur l'id suffit pour les deux
// sections. Les avoirs sont exclus (ce ne sont pas des achats) ainsi que les
// factures supprimées. On récupère un lot puis on trie côté client sur la
// date de facture (le tri PostgREST sur une colonne embarquée est fragile).

const NB_ACHATS = 5
const LOT = 200

const fmtEur = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQte = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 })
const fmtDate = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export default function DerniersAchatsModal({ ingredient, onClose, c, isMobile, lienFacture }) {
  const [achats, setAchats] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    if (!ingredient) return
    let annule = false
    ;(async () => {
      try {
        setLoading(true)
        setErreur(null)
        const clientId = await getClientId()
        const { data, error } = await supabase
          .from('achats_lignes')
          .select('id, quantite, unite, prix_unitaire_ht, remise, montant_ht, created_at, achats_factures!inner(id, fournisseur, date_facture, statut, deleted_at)')
          .eq('client_id', clientId)
          .eq('ingredient_id', ingredient.id)
          .is('achats_factures.deleted_at', null)
          .neq('achats_factures.statut', 'avoir')
          .order('created_at', { ascending: false })
          .limit(LOT)
        if (error) throw error
        const tries = (data || [])
          .filter(l => l.achats_factures)
          .sort((a, b) => {
            const da = a.achats_factures.date_facture || ''
            const db = b.achats_factures.date_facture || ''
            if (da !== db) return da < db ? 1 : -1
            return (a.created_at || '') < (b.created_at || '') ? 1 : -1
          })
          .slice(0, NB_ACHATS)
        if (!annule) setAchats(tries)
      } catch (e) {
        console.error('Derniers achats :', e)
        if (!annule) setErreur("Impossible de charger l'historique d'achats.")
      } finally {
        if (!annule) setLoading(false)
      }
    })()
    return () => { annule = true }
  }, [ingredient])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!ingredient) return null

  const prixNet = (l) => Number(l.prix_unitaire_ht) * (1 - (Number(l.remise) || 0) / 100)

  const th = { padding: '8px 12px', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' }
  const td = { padding: '10px 12px', fontSize: '13px', color: c.texte, whiteSpace: 'nowrap' }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div role="dialog" aria-modal="true" aria-label={`Derniers achats — ${ingredient.nom}`} onClick={e => e.stopPropagation()} style={{
        background: c.blanc, borderRadius: '14px', width: '100%', maxWidth: '640px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{ padding: '18px 20px', borderBottom: `0.5px solid ${c.bordure}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: c.texte }}>🧾 {ingredient.nom}</div>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>
                {NB_ACHATS} derniers achats
                {ingredient.prix_kg ? ` · prix actuel ${fmtEur(ingredient.prix_kg)} / ${ingredient.unite || '—'}` : ''}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: c.texteMuted, lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ overflow: 'auto', padding: isMobile ? '8px 12px 16px' : '8px 8px 16px' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>Chargement…</div>
          ) : erreur ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#DC2626', fontSize: '13px' }}>{erreur}</div>
          ) : achats.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
              Aucun achat enregistré pour cet ingrédient.
            </div>
          ) : isMobile ? (
            achats.map(l => {
              const f = l.achats_factures
              return (
                <div key={l.id} style={{ border: `0.5px solid ${c.bordure}`, borderRadius: '8px', padding: '10px 12px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', color: c.texte }}>
                    <span style={{ fontWeight: '500' }}>{f.fournisseur || '—'}</span>
                    <span style={{ color: c.texteMuted }}>{fmtDate(f.date_facture)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>
                    <span>{fmtQte(l.quantite)} {l.unite || ''} × {fmtEur(prixNet(l))}</span>
                    <span style={{ color: c.texte, fontWeight: '500' }}>{fmtEur(l.montant_ht)}</span>
                  </div>
                  {lienFacture && (
                    <Link href={`/controle-gestion/achats/${f.id}`} style={{ fontSize: '12px', color: c.accent, marginTop: '6px', display: 'inline-block' }}>
                      Voir {f.statut === 'bl' ? 'le BL' : 'la facture'} →
                    </Link>
                  )}
                </div>
              )
            })
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${c.bordure}` }}>
                  <th style={th}>Date</th>
                  <th style={th}>Fournisseur</th>
                  <th style={{ ...th, textAlign: 'right' }}>Quantité</th>
                  <th style={{ ...th, textAlign: 'right' }}>Prix unit. HT</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total HT</th>
                  {lienFacture && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {achats.map((l, i) => {
                  const f = l.achats_factures
                  return (
                    <tr key={l.id} style={{ borderBottom: i < achats.length - 1 ? `0.5px solid ${c.bordure}` : 'none' }}>
                      <td style={{ ...td, color: c.texteMuted }}>{fmtDate(f.date_facture)}</td>
                      <td style={{ ...td, whiteSpace: 'normal', fontWeight: '500' }}>
                        {f.fournisseur || '—'}
                        {f.statut === 'bl' && <span style={{ fontSize: '10px', color: c.texteMuted, marginLeft: '6px' }}>BL</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtQte(l.quantite)} {l.unite || ''}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {fmtEur(prixNet(l))}
                        {Number(l.remise) > 0 && <div style={{ fontSize: '10px', color: c.texteMuted }}>remise {fmtQte(l.remise)} %</div>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '500' }}>{fmtEur(l.montant_ht)}</td>
                      {lienFacture && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Link href={`/controle-gestion/achats/${f.id}`} title="Ouvrir le document" style={{ color: c.accent, fontSize: '12px', textDecoration: 'none' }}>Voir →</Link>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
