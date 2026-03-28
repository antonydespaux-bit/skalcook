'use client'
import { useState, useRef, useEffect } from 'react'
import { theme } from '../lib/theme.jsx'

export default function IngredientSearch({ ingredients, value, onChange, placeholder }) {
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [surbrillance, setSurbrillance] = useState(-1)
  const inputRef = useRef(null)
  const listeRef = useRef(null)
  const c = theme.couleurs

  const ingSelectione = ingredients.find(i => i.id === value)

  useEffect(() => {
    if (ingSelectione) {
      setRecherche(ingSelectione.nom)
    } else {
      setRecherche('')
    }
  }, [value])

  const ingredientsFiltres = recherche.length > 0
    ? ingredients.filter(i =>
        i.nom.toLowerCase().includes(recherche.toLowerCase())
      ).slice(0, 20)
    : []

  // Liste ordonnée dans le même ordre que le rendu (ingrédients normaux, puis sous-fiches).
  // Utilisée pour la navigation clavier afin que l'index corresponde à ce qui est affiché.
  const itemsAffiches = [
    ...ingredientsFiltres.filter(i => !i.est_sous_fiche),
    ...ingredientsFiltres.filter(i => i.est_sous_fiche),
  ]

  const handleInput = (e) => {
    setRecherche(e.target.value)
    setOuvert(true)
    setSurbrillance(-1)
    if (e.target.value === '') onChange('')
  }

  const handleSelect = (ing) => {
    setRecherche(ing.nom)
    onChange(ing.id)
    setOuvert(false)
    setSurbrillance(-1)
  }

  const handleKeyDown = (e) => {
    if (!ouvert) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurbrillance(prev => Math.min(prev + 1, itemsAffiches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurbrillance(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && surbrillance >= 0) {
      e.preventDefault()
      handleSelect(itemsAffiches[surbrillance])
    } else if (e.key === 'Escape') {
      setOuvert(false)
    }
  }

  const handleBlur = () => {
    setTimeout(() => setOuvert(false), 150)
  }

  const estSousFiche = ingSelectione?.est_sous_fiche

  const normaux = ingredientsFiltres.filter(i => !i.est_sous_fiche)
  const sousFichesItems = ingredientsFiltres.filter(i => i.est_sous_fiche)

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        value={recherche}
        onChange={handleInput}
        onFocus={() => recherche.length > 0 && setOuvert(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Rechercher un ingrédient...'}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: '8px',
          border: `0.5px solid ${estSousFiche ? '#AFA9EC' : c.bordure}`,
          fontSize: '13px',
          background: estSousFiche ? '#EEEDFE' : 'white',
          outline: 'none', color: c.texte, minWidth: 0
        }}
      />

      {ouvert && itemsAffiches.length > 0 && (
        <div
          ref={listeRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'white', borderRadius: '8px', zIndex: 1000,
            border: `0.5px solid ${c.bordure}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            maxHeight: '240px', overflowY: 'auto',
            marginTop: '4px'
          }}
        >
          {normaux.map((ing) => {
            const idx = itemsAffiches.indexOf(ing)
            return (
              <div
                key={ing.id}
                onMouseDown={() => handleSelect(ing)}
                onMouseEnter={() => setSurbrillance(idx)}
                style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                  color: c.texte,
                  background: surbrillance === idx ? c.accentClair : 'white',
                  borderBottom: `0.5px solid ${c.bordure}`
                }}
              >
                <div style={{ fontWeight: '500' }}>{ing.nom}</div>
                {ing.prix_kg && (
                  <div style={{ fontSize: '11px', color: c.texteMuted }}>
                    {Number(ing.prix_kg).toFixed(2)} € / {ing.unite || 'kg'}
                  </div>
                )}
              </div>
            )
          })}
          {sousFichesItems.length > 0 && (
            <>
              <div style={{ padding: '6px 14px', fontSize: '11px', color: c.texteMuted, background: c.fond, fontWeight: '500', textTransform: 'uppercase' }}>
                Sous-fiches
              </div>
              {sousFichesItems.map((ing) => {
                const idx = itemsAffiches.indexOf(ing)
                return (
                  <div
                    key={ing.id}
                    onMouseDown={() => handleSelect(ing)}
                    onMouseEnter={() => setSurbrillance(idx)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                      color: '#3C3489',
                      background: surbrillance === idx ? '#EEEDFE' : 'white',
                      borderBottom: `0.5px solid ${c.bordure}`
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>[SF] {ing.nom}</div>
                    {ing.prix_kg && (
                      <div style={{ fontSize: '11px', color: '#7F77DD' }}>
                        {Number(ing.prix_kg).toFixed(4)} € / {ing.unite || 'kg'}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
