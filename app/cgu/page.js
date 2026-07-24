import BackToLanding from '../../components/BackToLanding'

export default function CGU() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', color: '#18181B', lineHeight: '1.8' }}>
      <BackToLanding />
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Conditions Générales d'Utilisation</h1>
      <p style={{ color: '#71717A', fontSize: '13px', marginBottom: '32px' }}>Version 1.0 — Dernière mise à jour : juillet 2026</p>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 1 — Objet</h2>
        <p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application SaaS Skalcook, éditée par <strong>AD Consulting</strong>, entreprise individuelle (micro-entrepreneur) dont les coordonnées figurent dans les <a href="/mentions-legales" style={{ color: '#6366F1' }}>mentions légales</a>. En accédant à l'application, l'utilisateur accepte sans réserve les présentes CGU.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 2 — Description du service</h2>
        <p>Skalcook est une solution de gestion pour la restauration permettant de créer et gérer des fiches techniques, calculer des food costs, gérer les stocks, les inventaires et les achats fournisseurs. Le service est fourni en mode SaaS sous forme d'abonnement.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 3 — Accès au service</h2>
        <p>L'accès au service est strictement réservé aux professionnels (B2B). L'utilisateur déclare agir dans le cadre de son activité professionnelle et renonce expressément à se prévaloir des dispositions protectrices du Code de la consommation. L'utilisateur s'engage à :</p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Créer un compte avec des informations exactes et à jour</li>
          <li>Ne pas partager ses identifiants de connexion</li>
          <li>Utiliser le service conformément à sa destination professionnelle</li>
          <li>Ne pas tenter de contourner les mesures de sécurité</li>
        </ul>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 4 — Abonnement et facturation</h2>
        <p>L'accès au service est conditionné à la souscription d'un abonnement payant. Les tarifs en vigueur sont communiqués à l'utilisateur avant la souscription et figurent sur la facture. La facturation est mensuelle ou annuelle selon la formule choisie. Toute période commencée est due.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 5 — Retard de paiement</h2>
        <p>Conformément à l'article L.441-10 du Code de commerce, tout retard de paiement entraîne de plein droit, sans mise en demeure préalable :</p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Des pénalités de retard calculées au taux d'intérêt appliqué par la Banque Centrale Européenne à son opération de refinancement la plus récente, majoré de 10 points de pourcentage</li>
          <li>Une indemnité forfaitaire pour frais de recouvrement de 40 € (article D.441-5 du Code de commerce)</li>
        </ul>
        <p>En cas de non-paiement persistant, AD Consulting se réserve le droit de suspendre l'accès au service après mise en demeure restée sans effet pendant 15 jours.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 6 — Résiliation</h2>
        <p>L'utilisateur peut résilier son abonnement à tout moment depuis son espace « Mon Compte », rubrique « Abonnement ». La résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement ne sera effectué pour la période restante.</p>
        <p>AD Consulting se réserve le droit de résilier l'abonnement en cas de manquement grave de l'utilisateur aux présentes CGU, après mise en demeure restée sans effet pendant 15 jours.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 7 — Données et confidentialité</h2>
        <p>Les données saisies dans l'application restent la propriété de l'utilisateur. AD Consulting s'engage à ne pas les exploiter à des fins commerciales. En cas de résiliation, les données sont conservées 30 jours (fenêtre d'export/récupération) puis supprimées définitivement, sauf obligation légale de conservation. Consultez notre <a href="/politique-confidentialite" style={{ color: '#6366F1' }}>Politique de confidentialité</a> pour plus de détails.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 8 — Disponibilité du service</h2>
        <p>AD Consulting met en œuvre les moyens raisonnables pour assurer une disponibilité du service de 99% sur une base mensuelle, hors maintenances planifiées, cas de force majeure et défaillances des sous-traitants techniques (Vercel, Supabase, Resend). L'obligation est de moyens, non de résultat.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 9 — Propriété intellectuelle</h2>
        <p>L'application, son code source, son interface, ses bases de données (hors données utilisateur), ses marques et logos sont la propriété exclusive d'AD Consulting. L'utilisateur bénéficie d'un droit d'usage personnel, non exclusif et non cessible, strictement limité à la durée de son abonnement.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 10 — Responsabilité</h2>
        <p>L'utilisateur est seul responsable des données qu'il saisit dans l'application, notamment les informations sur les allergènes, la composition des plats et les données réglementaires transmises à ses propres clients. AD Consulting ne peut être tenu responsable des conséquences d'informations incorrectes ou incomplètes renseignées par l'utilisateur.</p>
        <p>La responsabilité d'AD Consulting, tous préjudices confondus, est limitée au montant des sommes effectivement versées par l'utilisateur au titre de l'abonnement au cours des 12 mois précédant le fait générateur de responsabilité.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 11 — Force majeure</h2>
        <p>Aucune des parties ne pourra être tenue responsable d'un manquement à ses obligations résultant d'un cas de force majeure au sens de l'article 1218 du Code civil, notamment : panne d'un sous-traitant technique, attaque informatique, décision d'une autorité publique, coupure des réseaux de télécommunication.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 12 — Modification des CGU</h2>
        <p>AD Consulting se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés par e-mail de toute modification substantielle au moins 30 jours avant son entrée en vigueur. Le maintien de l'abonnement vaut acceptation des nouvelles CGU.</p>
      </section>

      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>Article 13 — Droit applicable et juridiction</h2>
        <p>Les présentes CGU sont soumises au droit français. <strong>Tout litige relatif à leur formation, exécution ou interprétation relèvera de la compétence exclusive du Tribunal de commerce de Nanterre</strong>, y compris en cas de pluralité de défendeurs ou d'appel en garantie.</p>
      </section>

      <div style={{ marginTop: '40px', padding: '16px', background: '#F4F4F5', borderRadius: '8px', fontSize: '12px', color: '#71717A' }}>
        <strong>Contact :</strong> Pour toute question relative aux présentes CGU, contactez-nous à <a href="mailto:contact@skalcook.fr" style={{ color: '#6366F1' }}>contact@skalcook.fr</a>
      </div>
    </div>
  )
}
