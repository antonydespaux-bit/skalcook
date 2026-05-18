'use client'
import { useId } from 'react'

/**
 * Input texte avec autocomplete sur une liste de noms de fournisseurs.
 * S'appuie sur <datalist> natif : pas de portail, pas de gestion de focus,
 * comportement clavier/écran-lecteur géré par le navigateur.
 *
 * Pour un picker riche (suggestions custom, prix, frappe partielle), voir
 * <IngredientAutocomplete>.
 */
export default function FournisseurAutocomplete({
  value,
  onChange,
  options = [],
  placeholder = 'Nom du fournisseur',
  style,
}) {
  const listId = useId()
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        style={style}
      />
      <datalist id={listId}>
        {options.map((nom) => <option key={nom} value={nom} />)}
      </datalist>
    </>
  )
}
