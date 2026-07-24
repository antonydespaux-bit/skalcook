import BackToLanding from '../../components/BackToLanding'

export default function MentionsLegales() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', color: '#18181B', lineHeight: '1.8' }}>
      <BackToLanding />
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Mentions légales</h1>
      <p style={{ color: '#71717A', fontSize: '13px', marginBottom: '32px' }}>Dernière mise à jour : juillet 2026</p>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Éditeur du site</h2>
        <p><strong>Éditeur :</strong> Antony Despaux, entrepreneur individuel exerçant sous le nom commercial <strong>AD Consulting</strong></p>
        <p><strong>Forme juridique :</strong> Entreprise individuelle (régime micro-entrepreneur)</p>
        <p><strong>SIREN :</strong> 884 072 687</p>
        <p><strong>SIRET (siège) :</strong> 884 072 687 00012</p>
        <p><strong>Code APE :</strong> 70.22Z — Conseil pour les affaires et autres conseils de gestion</p>
        <p><strong>N° TVA intracommunautaire :</strong> non applicable — franchise en base de TVA (art. 293 B du CGI)</p>
        <p><strong>Adresse :</strong> 30B rue de Paris, 92190 Meudon, France</p>
        <p><strong>E-mail de contact :</strong> <a href="mailto:contact@skalcook.fr" style={{ color: '#6366F1' }}>contact@skalcook.fr</a></p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Directeur de la publication</h2>
        <p>Antony Despaux, en sa qualité d'exploitant de l'entreprise individuelle AD Consulting.</p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Hébergement</h2>
        <p><strong>Hébergeur de l'application :</strong> Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</p>
        <p><strong>Base de données :</strong> Supabase Inc. — infrastructure hébergée en Europe (région eu-west)</p>
        <p><strong>Envoi d'e-mails transactionnels :</strong> Resend, Inc., 2261 Market Street #5039, San Francisco, CA 94114, États-Unis</p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Propriété intellectuelle</h2>
        <p>« Skalcook » est une marque déposée. L'ensemble du contenu de l'application Skalcook (textes, graphismes, logos, icônes, images, code source) est la propriété exclusive d'AD Consulting et est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.</p>
        <p>Toute reproduction, représentation, modification ou exploitation non autorisée est strictement interdite.</p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Données personnelles</h2>
        <p>Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données personnelles.</p>
        <p>Pour exercer ces droits, écrivez à : <a href="mailto:contact@skalcook.fr" style={{ color: '#6366F1' }}>contact@skalcook.fr</a>. Les modalités complètes sont détaillées dans notre <a href="/politique-confidentialite" style={{ color: '#6366F1' }}>Politique de confidentialité</a>.</p>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #E4E4E7', paddingBottom: '8px' }}>Public concerné</h2>
        <p>Le service Skalcook est exclusivement destiné à une clientèle professionnelle (B2B). Il n'est pas accessible aux consommateurs au sens de l'article liminaire du Code de la consommation.</p>
      </section>

      <div style={{ marginTop: '40px', padding: '16px', background: '#F4F4F5', borderRadius: '8px', fontSize: '12px', color: '#71717A' }}>
        <strong>Loi applicable :</strong> Le présent site est soumis au droit français. En cas de litige, les tribunaux français seront seuls compétents.
      </div>
    </div>
  )
}
