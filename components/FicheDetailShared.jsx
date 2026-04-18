'use client'

import { ALLERGENES } from '../lib/allergenes'
import { Alert, Badge } from './ui'

/**
 * Shared allergen display block for fiche detail pages.
 * Used by both cuisine and bar fiche detail views.
 */
export function AllergenesBlock({ allergenes = [], allergenesCascade = [], c }) {
  if ((!allergenes || allergenes.length === 0) && allergenesCascade.length === 0) return null

  const directAllergens = allergenes || []
  const cascadeOnly = allergenesCascade.filter(id => !directAllergens.includes(id))

  return (
    <Alert variant="error" title="Allergènes présents" style={{ marginTop: '12px' }}>
      {directAllergens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: cascadeOnly.length > 0 ? '10px' : 0 }}>
          {directAllergens.map(id => {
            const a = ALLERGENES.find(al => al.id === id)
            return a ? (
              <Badge key={id} bg={'white'} color={'#A32D2D'} border="0.5px solid #F09595">
                {a.emoji} {a.label}
              </Badge>
            ) : null
          })}
        </div>
      )}
      {cascadeOnly.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: '#A32D2D', opacity: 0.7, marginBottom: '6px' }}>Issus des sous-fiches</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {cascadeOnly.map(id => {
              const a = ALLERGENES.find(al => al.id === id)
              return a ? (
                <Badge key={id} bg={'white'} color={'#A32D2D'} border="0.5px solid #F09595" style={{ opacity: 0.85 }}>
                  {a.emoji} {a.label}
                </Badge>
              ) : null
            })}
          </div>
        </>
      )}
    </Alert>
  )
}

/**
 * Shared financial recap block for fiche detail pages.
 * Shows cost, food cost %, recommended price, benefit.
 */
export function FicheFinancialRecap({ cout, fc, prixIndic, fiche, seuilVert, seuilOrange, c, tvaLabel }) {
  const nbPortions = fiche?.nb_portions || 1
  const coutPortion = nbPortions > 0 ? cout / nbPortions : 0
  const prixTTC = fiche?.prix_ttc ? Number(fiche.prix_ttc) : null

  const fcColor = fc ? (fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D') : null
  const fcBg = fc ? (fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB') : null

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
      <div className="sk-panel-header sk-label-muted" style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, color: c.texteMuted }}>
        Récap financier
      </div>
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <div>
          <div className="sk-label-muted" style={{ fontSize: '10px', color: c.texteMuted, marginBottom: '4px' }}>Coût total</div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: c.texte }}>{cout > 0 ? `${cout.toFixed(2)} €` : '—'}</div>
        </div>
        <div>
          <div className="sk-label-muted" style={{ fontSize: '10px', color: c.texteMuted, marginBottom: '4px' }}>Coût / portion</div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: c.texte }}>{coutPortion > 0 ? `${coutPortion.toFixed(2)} €` : '—'}</div>
        </div>
        <div>
          <div className="sk-label-muted" style={{ fontSize: '10px', color: c.texteMuted, marginBottom: '4px' }}>Prix TTC</div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: c.texte }}>{prixTTC ? `${prixTTC.toFixed(2)} €` : '—'}</div>
        </div>
        <div>
          <div className="sk-label-muted" style={{ fontSize: '10px', color: c.texteMuted, marginBottom: '4px' }}>
            Food Cost {tvaLabel ? `(TVA ${tvaLabel})` : ''}
          </div>
          {fc ? (
            <Badge bg={fcBg} color={fcColor} size="lg">
              {fc} %
            </Badge>
          ) : (
            <div style={{ fontSize: '18px', fontWeight: '500', color: c.texteMuted }}>—</div>
          )}
        </div>
        {prixIndic && (
          <div>
            <div className="sk-label-muted" style={{ fontSize: '10px', color: c.texteMuted, marginBottom: '4px' }}>Prix indicatif TTC</div>
            <div style={{ fontSize: '18px', fontWeight: '500', color: '#6366F1' }}>{prixIndic} €</div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Shared detail page navbar for fiche pages.
 */
export function FicheDetailNavbar({
  ficheNom, section, peutModifier, isMobile,
  onBack, onPrint, onModifier, onDelete,
  navBg, navBorder, printBg, printColor, logoComponent
}) {
  return (
    <div className="no-print" style={{
      background: navBg, borderBottom: `0.5px solid ${navBorder}`,
      padding: '0 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', height: '56px',
      position: 'sticky', top: 0, zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {logoComponent}
        <button onClick={onBack} style={{
          background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
        }}>← {!isMobile && 'Retour'}</button>
        {!isMobile && <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{ficheNom}</span>}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onPrint} style={{
          background: printBg, color: printColor, border: 'none',
          borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
        }}>{isMobile ? '🖨️' : '🖨️ Imprimer'}</button>
        {peutModifier && (
          <button onClick={onModifier} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
          }}>{isMobile ? '✏️' : 'Modifier'}</button>
        )}
        {peutModifier && !isMobile && (
          <button onClick={onDelete} style={{
            background: 'transparent', color: '#F09595',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
          }}>Supprimer</button>
        )}
      </div>
    </div>
  )
}
