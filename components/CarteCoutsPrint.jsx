'use client'

// Version imprimable « fiche de coûts » d'une carte / d'un menu à prix fixe.
// Même charte que l'impression d'une fiche technique (Georgia, brun/beige,
// tableau bordé, bandeau récap). Usage interne : coût portion de chaque plat,
// coût retenu par section, coût matière, food cost et marge brute.
//
// Les montants viennent du calcul de la page carte (`calculs`) : HT = TTC / 1,10
// comme le ratio affiché à l'écran, pour que les chiffres imprimés et affichés
// soient identiques.

const BRUN = '#2C1810'
const BEIGE = '#8B7355'
const OR = '#C4956A'
const BORD = '0.5px solid #e8e4dc'

const eur = (n, dec = 2) => `${Number(n || 0).toFixed(dec)} €`

function couleurFc(fc, seuilVert, seuilOrange) {
  if (!fc) return { bg: 'white', color: BRUN }
  const n = parseFloat(fc)
  if (n < seuilVert) return { bg: '#EAF3DE', color: '#3B6D11' }
  if (n < seuilOrange) return { bg: '#FAEEDA', color: '#854F0B' }
  return { bg: '#FCEBEB', color: '#A32D2D' }
}

export default function CarteCoutsPrint({ carte, calcBase, calcFull, statutItem, nomEtablissement, logoUrl, seuilVert, seuilOrange, t }) {
  const sections = [...(carte.carte_sections || [])].sort((a, b) => a.ordre - b.ordre)
  const avecSupp = calcFull.totalSupp > 0
  const dateImpression = new Date().toLocaleDateString('fr-FR')

  const colonnesRecap = [
    { titre: avecSupp ? t('cartes.costPrint.base') : null, calc: calcBase },
    ...(avecSupp ? [{ titre: t('cartes.costPrint.withSupplement'), calc: calcFull }] : []),
  ]

  const libelleStatut = (st) => {
    if (st.type === 'supp') return t('cartes.costPrint.supplement', { val: st.val.toFixed(0) })
    if (st.type === 'choix') return t('cartes.costPrint.choice')
    return t('cartes.costPrint.included')
  }

  const th = (align = 'right') => ({
    padding: '7px 10px', textAlign: align, fontWeight: '600', color: BRUN, fontSize: '9px',
    textTransform: 'uppercase', letterSpacing: '1px', border: BORD,
  })
  const td = { padding: '6px 10px', border: BORD, fontSize: '11px', color: BRUN }

  return (
    <div className="print-only" style={{ fontFamily: 'Georgia, serif', color: BRUN, background: 'white', width: '100%' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${BRUN}`, paddingBottom: '14px', marginBottom: '16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: BEIGE, marginBottom: '6px', fontFamily: 'sans-serif' }}>
            {t('cartes.costPrint.kicker')}
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: '400', color: BRUN, margin: '0 0 8px', letterSpacing: '1px' }}>{carte.nom}</h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: BEIGE, fontFamily: 'sans-serif', flexWrap: 'wrap' }}>
            <span>{t('cartes.costPrint.priceTTC')} : {eur(carte.prix_base, 0)}</span>
            {avecSupp && <span>{t('cartes.costPrint.supplementsTotal')} : +{eur(calcFull.totalSupp, 0)}</span>}
            <span>{t('cartes.costPrint.printedOn', { date: dateImpression })}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt={nomEtablissement} style={{ height: '56px', objectFit: 'contain' }} />
            : <div style={{ fontSize: '16px', fontWeight: '700', color: BRUN }}>{nomEtablissement}</div>}
        </div>
      </div>

      {/* Détail par section */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif', marginBottom: '18px' }}>
        <thead>
          <tr style={{ background: '#F0E8E0' }}>
            <th style={th('left')}>{t('cartes.costPrint.dish')}</th>
            <th style={th('left')}>{t('cartes.costPrint.status')}</th>
            <th style={th()}>{t('cartes.costPrint.costPortion')}</th>
          </tr>
        </thead>
        {sections.map(section => {
          const items = [...(section.carte_items || [])].sort((a, b) => a.ordre - b.ordre)
          const coutBase = calcBase.parSection[section.id] || 0
          const coutFull = calcFull.parSection[section.id] || 0
          return (
            <tbody key={section.id} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <tr>
                <td colSpan={3} style={{ ...td, background: '#FAF6F1', fontWeight: '700', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: BEIGE, paddingTop: '8px' }}>
                  {section.titre}
                </td>
              </tr>
              {items.map((item, idx) => {
                const st = statutItem(items, idx)
                const cout = item.fiches?.cout_portion
                return (
                  <tr key={item.id}>
                    <td style={{ ...td, fontWeight: item.relation === 'ou' ? '400' : '500', paddingLeft: item.relation === 'ou' ? '22px' : '10px' }}>
                      {item.relation === 'ou' && <span style={{ color: BEIGE, fontStyle: 'italic', marginRight: '6px' }}>{t('cartes.detail.or')}</span>}
                      {item.nom}
                    </td>
                    <td style={{ ...td, color: st.type === 'inclus' ? BEIGE : '#B45309', whiteSpace: 'nowrap' }}>{libelleStatut(st)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>{cout != null ? eur(cout) : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td colSpan={2} style={{ ...td, textAlign: 'right', color: BEIGE, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {t('cartes.costPrint.sectionCost')}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  {eur(coutBase)}
                  {avecSupp && Math.abs(coutFull - coutBase) > 0.005 && (
                    <div style={{ fontSize: '9px', color: '#B45309', fontWeight: '500' }}>{t('cartes.costPrint.withSupplementShort')} {eur(coutFull)}</div>
                  )}
                </td>
              </tr>
            </tbody>
          )
        })}
        <tbody>
          <tr style={{ background: BRUN }}>
            <td colSpan={2} style={{ padding: '8px 10px', color: OR, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', border: `0.5px solid ${BRUN}` }}>
              {t('cartes.costPrint.materialCost')}{avecSupp ? ` — ${t('cartes.costPrint.base').toLowerCase()}` : ''}
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right', color: OR, fontWeight: '700', fontSize: '14px', border: `0.5px solid ${BRUN}`, whiteSpace: 'nowrap' }}>
              {eur(calcBase.coutMatiere)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Récap financier */}
      {colonnesRecap.map(({ titre, calc }) => {
        const ht = calc.prixTotal / 1.10
        const marge = ht - calc.coutMatiere
        const s = couleurFc(calc.ratio, seuilVert, seuilOrange)
        const cases = [
          { label: t('cartes.costPrint.priceTTC'), value: calc.prixTotal ? eur(calc.prixTotal) : '—' },
          { label: t('cartes.costPrint.priceHT'), value: calc.prixTotal ? eur(ht) : '—' },
          { label: t('cartes.costPrint.materialCost'), value: eur(calc.coutMatiere) },
          { label: t('cartes.costPrint.foodCost'), value: calc.ratio ? `${calc.ratio} %` : '—', bg: s.bg, color: s.color },
          { label: t('cartes.costPrint.grossMargin'), value: calc.prixTotal ? eur(marge) : '—' },
        ]
        return (
          <div key={titre || 'base'} style={{ marginBottom: '12px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            {titre && <div style={{ fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: BEIGE, fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '6px' }}>{titre}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {cases.map(cs => (
                <div key={cs.label} style={{ border: BORD, borderRadius: '4px', padding: '8px 10px', background: cs.bg || 'white', fontFamily: 'sans-serif' }}>
                  <div style={{ fontSize: '8px', letterSpacing: '1px', textTransform: 'uppercase', color: cs.color || BEIGE, marginBottom: '4px' }}>{cs.label}</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: cs.color || BRUN }}>{cs.value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: '9px', color: BEIGE, fontFamily: 'sans-serif', fontStyle: 'italic', marginTop: '10px', lineHeight: 1.6 }}>
        {t('cartes.costPrint.note', { seuilVert, seuilOrange })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: BORD, marginTop: '18px', paddingTop: '8px', fontSize: '9px', color: BEIGE, fontFamily: 'sans-serif' }}>
        <span>{nomEtablissement}</span>
        <span>{t('cartes.costPrint.internal')}</span>
      </div>
    </div>
  )
}
