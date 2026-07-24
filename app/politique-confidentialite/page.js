import LegalShell from '../../components/LegalShell'

export default function PolitiqueConfidentialite() {
  return (
    <LegalShell eyebrow="Vie privée" title="Politique de Confidentialité" updated="Version 1.0 — Dernière mise à jour : juillet 2026">
      <section>
        <h2>1. Responsable du traitement</h2>
        <p><strong>AD Consulting</strong>, entreprise individuelle (micro-entrepreneur) exploitée par Antony Despaux, domiciliée au 30B rue de Paris, 92190 Meudon (SIREN 884 072 687), est responsable du traitement des données personnelles collectées via l'application Skalcook.</p>
        <p><strong>Contact :</strong> <a href="mailto:contact@skalcook.fr">contact@skalcook.fr</a></p>
        <p>AD Consulting n'a pas désigné de Délégué à la Protection des Données (DPO), cette désignation n'étant pas obligatoire au regard de la nature et du volume des traitements (art. 37 RGPD). Les demandes relatives aux données personnelles sont traitées directement par le responsable de traitement.</p>
      </section>

      <section>
        <h2>2. Données collectées</h2>
        <ul>
          <li><strong>Données d'identification :</strong> nom, prénom, adresse e-mail</li>
          <li><strong>Données d'authentification :</strong> mot de passe stocké sous forme de hash (via Supabase Auth), jetons de session</li>
          <li><strong>Données professionnelles :</strong> nom de l'établissement, SIRET, numéro TVA, adresse</li>
          <li><strong>Données d'utilisation :</strong> fiches techniques, recettes, ingrédients, stocks, inventaires, fournisseurs, fiches clients CRM, devis</li>
          <li><strong>Données de connexion :</strong> adresse IP, logs d'accès, user-agent (navigateur)</li>
        </ul>
        <p>Aucune donnée sensible au sens de l'article 9 du RGPD (santé, opinions politiques, etc.) n'est volontairement collectée.</p>
      </section>

      <section>
        <h2>3. Finalités du traitement</h2>
        <ul>
          <li>Fournir le service Skalcook (exécution du contrat)</li>
          <li>Gérer votre compte et votre abonnement</li>
          <li>Assurer la sécurité et la maintenance de l'application</li>
          <li>Envoyer les e-mails transactionnels (invitation, confirmation, réinitialisation de mot de passe)</li>
          <li>Répondre à vos demandes de support</li>
          <li>Respecter nos obligations légales (facturation, comptabilité)</li>
        </ul>
      </section>

      <section>
        <h2>4. Base légale du traitement</h2>
        <ul>
          <li><strong>Exécution du contrat (art. 6.1.b RGPD) :</strong> traitement nécessaire à la fourniture du service</li>
          <li><strong>Obligation légale (art. 6.1.c RGPD) :</strong> conservation des données de facturation</li>
          <li><strong>Intérêt légitime (art. 6.1.f RGPD) :</strong> sécurité, prévention des fraudes, amélioration du service</li>
        </ul>
      </section>

      <section>
        <h2>5. Durée de conservation</h2>
        <ul>
          <li><strong>Données du compte :</strong> durée de l'abonnement + 30 jours après résiliation</li>
          <li><strong>Données de facturation :</strong> 10 ans (obligation comptable, art. L.123-22 Code de commerce)</li>
          <li><strong>Logs de connexion :</strong> 12 mois (recommandation CNIL)</li>
          <li><strong>E-mails transactionnels :</strong> 13 mois côté Resend</li>
        </ul>
      </section>

      <section>
        <h2>6. Destinataires et sous-traitants</h2>
        <p>Vos données sont transmises aux sous-traitants techniques suivants, liés par un accord de traitement des données (DPA) conforme à l'article 28 du RGPD :</p>
        <ul>
          <li><strong>Supabase Inc.</strong> — hébergement de la base de données et authentification. Données stockées dans l'Union européenne (région eu-west).</li>
          <li><strong>Vercel Inc.</strong> — hébergement de l'application web. Transfert vers les États-Unis (voir §7).</li>
          <li><strong>Resend, Inc.</strong> — envoi d'e-mails transactionnels. Transfert vers les États-Unis (voir §7).</li>
          <li><strong>Upstash, Inc.</strong> — limitation de débit (anti-abus). Données de connexion traitées en Europe.</li>
          <li><strong>Anthropic, PBC</strong> — fonctionnalités d'assistance par intelligence artificielle (uniquement si l'utilisateur y a recours). Transfert vers les États-Unis (voir §7).</li>
        </ul>
        <p>Nous ne vendons ni ne louons vos données à des tiers.</p>
      </section>

      <section>
        <h2>7. Transferts de données hors Union européenne</h2>
        <p>Certains sous-traitants listés au §6 (Vercel, Resend, Anthropic) sont établis aux États-Unis. Les transferts de données personnelles vers ces prestataires sont encadrés par l'une des garanties appropriées prévues par le chapitre V du RGPD :</p>
        <ul>
          <li><strong>EU-US Data Privacy Framework (DPF)</strong> — décision d'adéquation de la Commission européenne du 10 juillet 2023, lorsque le prestataire y est certifié ;</li>
          <li><strong>Clauses Contractuelles Types (CCT)</strong> adoptées par la Commission européenne le 4 juin 2021, à défaut.</li>
        </ul>
        <p>Vous pouvez obtenir une copie de ces garanties en écrivant à <a href="mailto:contact@skalcook.fr">contact@skalcook.fr</a>.</p>
      </section>

      <section>
        <h2>8. Vos droits (RGPD)</h2>
        <ul>
          <li><strong>Droit d'accès (art. 15) :</strong> obtenir une copie de vos données</li>
          <li><strong>Droit de rectification (art. 16) :</strong> corriger vos données</li>
          <li><strong>Droit à l'effacement (art. 17) :</strong> supprimer vos données</li>
          <li><strong>Droit à la portabilité (art. 20) :</strong> exporter vos données (disponible dans Mon Compte)</li>
          <li><strong>Droit d'opposition (art. 21) :</strong> vous opposer à certains traitements</li>
          <li><strong>Droit de définir des directives post-mortem</strong> (art. 85 loi Informatique et Libertés)</li>
        </ul>
        <p>Contact : <a href="mailto:contact@skalcook.fr">contact@skalcook.fr</a> — Délai de réponse : 30 jours maximum.</p>
        <p>En cas de réclamation non traitée, vous pouvez saisir la <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>).</p>
      </section>

      <section>
        <h2>9. Sécurité</h2>
        <p>Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données : chiffrement HTTPS/TLS pour tous les échanges, authentification sécurisée via Supabase Auth, mots de passe stockés sous forme de hash, isolation des données par établissement via Row Level Security (RLS), accès restreint par rôles, sauvegardes régulières.</p>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>L'application utilise uniquement des cookies techniques strictement nécessaires à son fonctionnement (session d'authentification, préférences d'interface). Aucun cookie publicitaire, analytique tiers ou de traçage n'est utilisé. Ces cookies sont exemptés de consentement préalable conformément à l'article 82 de la loi Informatique et Libertés.</p>
      </section>

      <section>
        <h2>11. Décisions automatisées</h2>
        <p>Aucune décision produisant des effets juridiques à votre égard n'est prise de manière exclusivement automatisée. Les fonctionnalités d'assistance par intelligence artificielle sont des outils d'aide, sans prise de décision automatisée au sens de l'article 22 du RGPD.</p>
      </section>

      <div className="sk-legal__callout sk-legal__callout--accent">
        <strong>CNIL :</strong> Vous pouvez également adresser une réclamation à la Commission Nationale de l'Informatique et des Libertés (CNIL) — <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>
      </div>
    </LegalShell>
  )
}
