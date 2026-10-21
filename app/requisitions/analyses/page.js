'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../../lib/supabase'
import { appelApiRequisitions } from '../../../lib/requisitions/apiClient'
import { buildAnalysesWorkbook, telechargerXlsx } from '../../../lib/requisitions/analysesExport'
import { getPeriodDates } from '../../../lib/caAnalyses'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { texteSurAccent } from '../../../lib/theme.jsx'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

// Analyses des réquisitions : ce que chaque service a consommé (valeur HT
// figée à la livraison), qui l'a servi, et les produits les plus sortis.

const PRESETS = ['mois-en-cours', 'mois-precedent', '30j', 'trimestre', 'annee']

export default function AnalysesRequisitionsPage() {
  const { t, i18n } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const surAccent = texteSurAccent(c)
  const langue = i18n.language || 'fr'

  const initiale = getPeriodDates('mois-en-cours')
  const [clientId, setClientId] = useState(null)
  const [debut, setDebut] = useState(initiale.debut)
  const [fin, setFin] = useState(initiale.fin)
  const [serviceId, setServiceId] = useState('')
  const [d, setD] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [export_, setExport] = useState(false)
  const [voirTout, setVoirTout] = useState(false)

  const recuperer = useCallback(async () => {
    const id = await getClientId()
    if (!id) return null
    const q = new URLSearchParams({ client_id: id, debut, fin, ...(serviceId ? { service_id: serviceId } : {}) })
    return { id, r: await appelApiRequisitions(`/api/requisitions/analyses?${q}`) }
  }, [debut, fin, serviceId])

  useEffect(() => {
    let annule = false
    recuperer()
      .then((x) => { if (!annule && x) { setClientId(x.id); setD(x.r); setErreur('') } })
      .catch((e) => { if (!annule) setErreur(e.message) })
      .finally(() => { if (!annule) setChargement(false) })
    return () => { annule = true }
  }, [recuperer])

  const euro = useMemo(() => new Intl.NumberFormat(langue, { style: 'currency', currency: 'EUR' }), [langue])
  const qte = useMemo(() => new Intl.NumberFormat(langue, { maximumFractionDigits: 3 }), [langue])
  const nomService = useCallback((id) => d?.services.find((s) => s.id === id)?.nom ?? '—', [d])

  const appliquerPreset = (k) => {
    const p = getPeriodDates(k)
    if (!p) return
    setChargement(true)
    setDebut(p.debut)
    setFin(p.fin)
  }

  const exporter = async () => {
    if (!d) return
    setExport(true)
    try {
      const wb = await buildAnalysesWorkbook({ t, analyses: d, nomService })
      await telechargerXlsx(wb, `requisitions_${debut}_${fin}.xlsx`)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setExport(false)
    }
  }

  const carte = { background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }
  const titreCarte = { fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }
  const champ = { padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', color: c.texte, background: c.blanc }
  const btn = { padding: '7px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: '12px', cursor: 'pointer' }

  // Barre horizontale proportionnelle à la part de la valeur totale.
  const barre = (part) => (
    <div style={{ height: '6px', background: c.fond, borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ width: `${Math.min(100, part)}%`, height: '100%', background: c.accent }} />
    </div>
  )

  const kpi = (libelle, valeur) => (
    <div style={{ ...carte, padding: '14px 16px' }}>
      <div style={{ fontSize: '12px', color: c.texteMuted }}>{libelle}</div>
      <div style={{ fontSize: '22px', fontWeight: '600', color: c.texte, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{valeur}</div>
    </div>
  )

  const tableService = (liste, titre) => (
    <div style={carte}>
      <div style={titreCarte}>{titre}</div>
      {liste.length === 0 ? (
        <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.analyses.empty')}</div>
      ) : liste.map((s) => (
        <div key={s.service_id} style={{ padding: '8px 0', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', color: c.texte }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
            <span style={{ flex: '1 1 auto' }}>{s.emoji || '🛎️'} {s.nom}</span>
            <span style={{ color: c.texteMuted, fontSize: '12px' }}>{t('requisitions.analyses.slips', { count: s.bons })}</span>
            <span style={{ fontWeight: '600', fontVariantNumeric: 'tabular-nums', minWidth: '90px', textAlign: 'right' }}>{euro.format(s.valeur)}</span>
            <span style={{ color: c.texteMuted, fontSize: '12px', minWidth: '44px', textAlign: 'right' }}>{s.part} %</span>
          </div>
          {barre(s.part)}
        </div>
      ))}
    </div>
  )

  const produits = d ? (voirTout ? d.par_produit : d.par_produit.slice(0, 15)) : []

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '600', color: c.texte, margin: 0, flex: '1 1 auto' }}>{t('requisitions.analyses.title')}</h1>
          <button onClick={exporter} disabled={!d || export_} style={{
            padding: '9px 16px', borderRadius: '10px', border: 'none', background: d ? c.accent : c.bordure,
            color: d ? surAccent : c.texteMuted, fontSize: '13px', fontWeight: '500', cursor: d ? 'pointer' : 'not-allowed',
          }}>⬇ {t('requisitions.analyses.exportExcel')}</button>
        </div>
        <div style={{ fontSize: '13px', color: c.texteMuted }}>{t('requisitions.analyses.subtitle')}</div>

        {/* Filtres */}
        <div style={{ ...carte, display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '12px', color: c.texteMuted }}>
            {t('requisitions.analyses.from')}
            <input type="date" value={debut} max={fin} onChange={(e) => { setChargement(true); setDebut(e.target.value) }} style={{ ...champ, display: 'block', marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '12px', color: c.texteMuted }}>
            {t('requisitions.analyses.to')}
            <input type="date" value={fin} min={debut} onChange={(e) => { setChargement(true); setFin(e.target.value) }} style={{ ...champ, display: 'block', marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '12px', color: c.texteMuted }}>
            {t('requisitions.analyses.service')}
            <select value={serviceId} onChange={(e) => { setChargement(true); setServiceId(e.target.value) }} style={{ ...champ, display: 'block', marginTop: '4px' }}>
              <option value="">{t('requisitions.analyses.allServices')}</option>
              {(d?.services || []).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {PRESETS.map((k) => <button key={k} onClick={() => appliquerPreset(k)} style={btn}>{t(`requisitions.analyses.presets.${k}`)}</button>)}
          </div>
        </div>

        {erreur && <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: c.rougeClair, color: c.rouge }}>{erreur}</div>}

        {chargement && !d ? <ChefLoader /> : d && (
          <div style={{ opacity: chargement ? 0.5 : 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
              {kpi(t('requisitions.analyses.totalValue'), euro.format(d.totaux.valeur))}
              {kpi(t('requisitions.analyses.deliveredSlips'), d.totaux.bons)}
              {kpi(t('requisitions.analyses.lines'), d.totaux.lignes)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              {tableService(d.par_service, t('requisitions.analyses.byService'))}
              {tableService(d.par_preparateur, t('requisitions.analyses.byPreparer'))}
            </div>

            <div style={carte}>
              <div style={titreCarte}>{t('requisitions.analyses.byProduct')}</div>
              {produits.length === 0 ? (
                <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.analyses.empty')}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: c.texte }}>
                    <thead>
                      <tr style={{ color: c.texteMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>{t('requisitions.analyses.product')}</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('requisitions.analyses.quantity')}</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('requisitions.analyses.value')}</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('requisitions.analyses.share')}</th>
                        {!isMobile && <th style={{ padding: '6px 8px' }}>{t('requisitions.analyses.mainService')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {produits.map((p) => {
                        const principal = Object.entries(p.par_service).sort((a, b) => b[1] - a[1])[0]
                        return (
                          <tr key={`${p.nom}|${p.unite}`} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
                            <td style={{ padding: '8px' }}>{p.nom}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qte.format(p.quantite)} {p.unite}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '500' }}>{euro.format(p.valeur)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: c.texteMuted }}>{p.part} %</td>
                            {!isMobile && <td style={{ padding: '8px', color: c.texteMuted }}>{principal ? `${nomService(principal[0])} (${qte.format(principal[1])} ${p.unite})` : '—'}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {d.par_produit.length > 15 && (
                <button onClick={() => setVoirTout((v) => !v)} style={{ ...btn, marginTop: '10px' }}>
                  {voirTout ? t('requisitions.analyses.showLess') : t('requisitions.analyses.showAll', { count: d.par_produit.length })}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
