import Link from 'next/link'

/**
 * BackToLanding — lien de retour vers la landing page, destiné aux pages
 * annexes autonomes (mentions légales, CGU, politique de confidentialité) qui
 * n'ont sinon aucune navigation. Pointe explicitement vers « / » (et non un
 * router.back()) pour fonctionner même en arrivée directe depuis un lien externe.
 */
export default function BackToLanding({ style }) {
  return (
    <Link
      href="/"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: '#6366F1',
        fontSize: '14px',
        fontWeight: 500,
        textDecoration: 'none',
        marginBottom: '24px',
        ...style,
      }}
    >
      ← Retour au site
    </Link>
  )
}
