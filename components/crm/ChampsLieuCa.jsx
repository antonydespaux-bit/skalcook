'use client'

/**
 * Champs « Maison / salle » + « CA pour » d'un événement ou d'un devis
 * de groupe (crm_lieux, cf. lib/crmPerimetre.js). Rien n'est affiché si le
 * groupe n'a pas de lieux déclarés.
 *
 * Choisir une maison qui est un établissement (MARSAN, JOIA) y impute le CA ;
 * une salle sans établissement (Maison Michodière) demande de choisir
 * l'établissement qui encaissera une fois le devis signé.
 *
 * Props:
 *   c, inputStyle, labelStyle : styles du formulaire parent
 *   lieux    : [{ id, nom, client_id }]
 *   lieuId, etablissementCaId : valeurs
 *   onChange({ lieu_id, etablissement_ca_id })
 */
export default function ChampsLieuCa({ c, inputStyle, labelStyle, lieux = [], lieuId, etablissementCaId, onChange }) {
  if (!lieux.length) return null
  const etablissements = lieux.filter((l) => l.client_id)
  const lieu = lieux.find((l) => l.id === lieuId)

  const choisirLieu = (e) => {
    const id = e.target.value
    const choisi = lieux.find((l) => l.id === id)
    onChange({
      lieu_id: id || '',
      etablissement_ca_id: choisi?.client_id || etablissementCaId || '',
    })
  }

  return (
    <div className="crm-form__grid crm-form__grid--2">
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Maison / salle</label>
        <select className="crm-field__select" style={inputStyle} value={lieuId || ''} onChange={choisirLieu}>
          <option value="">Non précisé</option>
          {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
        </select>
      </div>
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>CA pour</label>
        <select
          className="crm-field__select"
          style={inputStyle}
          value={etablissementCaId || ''}
          onChange={(e) => onChange({ lieu_id: lieuId || '', etablissement_ca_id: e.target.value })}
        >
          <option value="">À choisir à la signature</option>
          {etablissements.map((l) => <option key={l.client_id} value={l.client_id}>{l.nom}</option>)}
        </select>
        {lieu && !lieu.client_id && !etablissementCaId && (
          <span className="crm-field__hint" style={{ color: c.texteMuted }}>
            {lieu.nom} n’encaisse pas : choisissez la maison qui recevra le CA.
          </span>
        )}
      </div>
    </div>
  )
}
