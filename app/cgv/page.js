import LegalShell from '../../components/LegalShell'

// Même texte que le document « CGV skalcook » v1.0 (hors coordonnées
// bancaires, qui figurent sur les factures et le contrat).
export default function CGV() {
  return (
    <LegalShell eyebrow="Conditions de vente" title="Conditions Générales de Vente" updated="Version 1.0 — En vigueur au 16 octobre 2026">
      <section>
        <h2>Article 1 — Objet et champ d&apos;application</h2>
        <p>Les présentes conditions générales de vente (les « CGV ») régissent la fourniture du logiciel Skalcook en mode abonnement (SaaS) par <strong>AD Consulting</strong> — Antony Despaux, entrepreneur individuel, SIREN 884 072 687, siège au 30B rue de Paris, 92190 Meudon, e-mail <a href="mailto:antony@skalcook.com">antony@skalcook.com</a>, téléphone 06 63 56 61 67 (le « Prestataire »), à tout professionnel de la restauration ou de l&apos;hôtellerie qui souscrit un abonnement (le « Client »).</p>
        <p>Les CGV s&apos;appliquent exclusivement entre professionnels. Elles prévalent sur les conditions d&apos;achat du Client, sauf accord écrit contraire. L&apos;utilisation du logiciel par les utilisateurs du Client est en outre régie par les <a href="/cgu">conditions générales d&apos;utilisation</a>.</p>
        <p>Les documents contractuels sont, par ordre de priorité décroissante : le contrat particulier ou le bon de commande signé (et ses annexes), l&apos;accord de sous-traitance des données (DPA), les présentes CGV, puis les CGU.</p>
      </section>

      <section>
        <h2>Article 2 — Définitions</h2>
        <ul>
          <li><strong>Service</strong> : le logiciel Skalcook accessible en ligne, ses mises à jour et l&apos;assistance associée.</li>
          <li><strong>Établissement</strong> : un point d&apos;exploitation du Client disposant de son propre espace dans le Service. L&apos;abonnement est facturé par établissement.</li>
          <li><strong>Utilisateur</strong> : toute personne autorisée par le Client à accéder au Service. Le nombre d&apos;utilisateurs n&apos;est pas limité.</li>
          <li><strong>Données du Client</strong> : toutes les données saisies, importées ou générées par le Client dans le Service.</li>
          <li><strong>Commande</strong> : le contrat particulier, le contrat-cadre ou le bon de commande signé qui précise les établissements, les modules et les prix.</li>
        </ul>
      </section>

      <section>
        <h2>Article 3 — Description du Service</h2>
        <p>Le Service comprend, selon les modules souscrits dans la Commande :</p>
        <ul>
          <li><strong>Pack cuisine et bar</strong> : fiches techniques et coûts de revient, ingrédients, achats et lecture automatique des factures, menus, inventaires.</li>
          <li><strong>Pack gestion</strong> (option) : contrôle de gestion, chiffre d&apos;affaires et budgets, écarts de consommation, analyses de marges.</li>
          <li><strong>Vue groupe</strong> (option) : indicateurs consolidés et comparaison entre plusieurs établissements d&apos;un même groupe.</li>
        </ul>
        <p>La lecture automatique des factures repose sur un service d&apos;intelligence artificielle. Elle propose un pré-remplissage que l&apos;Utilisateur doit vérifier avant validation : le Prestataire ne garantit pas l&apos;exactitude de chaque valeur extraite. Elle est incluse dans un usage raisonnable, défini à l&apos;article 5.</p>
        <p>Le Service évolue : le Prestataire peut ajouter, modifier ou retirer des fonctionnalités, à condition de ne pas supprimer une fonctionnalité essentielle d&apos;un module souscrit en cours d&apos;engagement.</p>
      </section>

      <section>
        <h2>Article 4 — Commande et mise en service</h2>
        <p>L&apos;abonnement prend effet à la signature de la Commande. Le Prestataire crée les espaces des établissements et transmet les accès dans un délai de 5 jours ouvrés.</p>
        <p>La mise en service (paramétrage, import des données existantes, formation des équipes) est facturée une seule fois, au prix indiqué dans la Commande. Les développements spécifiques font l&apos;objet d&apos;un devis séparé.</p>
      </section>

      <section>
        <h2>Article 5 — Prix et facturation</h2>
        <p>Les prix sont ceux indiqués dans la Commande, par établissement et par mois. Ils sont exprimés en euros, TVA non applicable (article 293 B du Code général des impôts). Pour un Client établi dans un autre État membre de l&apos;Union européenne, la TVA est autoliquidée par le Client (article 196 de la directive 2006/112/CE).</p>
        <p>L&apos;abonnement est facturé mensuellement et d&apos;avance, au début de chaque mois. Un mois commencé est dû. Les frais de mise en service sont facturés à la signature de la Commande.</p>
        <p><strong>Révision annuelle.</strong> Sauf prix garantis dans la Commande, les prix sont révisés une fois par an, à la date anniversaire, selon la formule P1 = P0 × (S1 / S0), où P0 est le prix en vigueur, S0 le dernier indice Syntec publié à la date de la dernière révision (ou de la signature) et S1 le dernier indice Syntec publié à la date de révision.</p>
        <p><strong>Usage raisonnable de l&apos;IA.</strong> La lecture automatique des factures est incluse jusqu&apos;à 400 factures par mois et par établissement. Au-delà, les parties conviennent ensemble d&apos;un complément de prix.</p>
      </section>

      <section>
        <h2>Article 6 — Paiement</h2>
        <p>Les factures sont payables par virement à 30 jours date de facture, sur le compte indiqué sur la facture.</p>
        <p>Tout retard de paiement entraîne de plein droit, sans rappel préalable :</p>
        <ul>
          <li>des pénalités de retard au taux d&apos;intérêt appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de 10 points (article L. 441-10 du Code de commerce) ;</li>
          <li>une indemnité forfaitaire pour frais de recouvrement de 40 € (article D. 441-5 du Code de commerce).</li>
        </ul>
        <p>En cas de retard supérieur à 15 jours après une mise en demeure restée sans effet, le Prestataire peut suspendre l&apos;accès au Service, sans que cela ne libère le Client de ses obligations de paiement. Les Données du Client sont conservées pendant la suspension.</p>
      </section>

      <section>
        <h2>Article 7 — Durée et résiliation</h2>
        <p>L&apos;abonnement est conclu pour une durée initiale de 12 mois à compter de sa prise d&apos;effet. Il est ensuite renouvelé par tacite reconduction pour des périodes successives de 12 mois.</p>
        <p>Chaque partie peut résilier l&apos;abonnement à l&apos;échéance, par e-mail ou lettre recommandée, en respectant un préavis de 3 mois avant la date d&apos;échéance. La résiliation peut porter sur un ou plusieurs établissements seulement.</p>
        <p>En cas de manquement grave d&apos;une partie à ses obligations, non corrigé dans les 30 jours suivant une mise en demeure, l&apos;autre partie peut résilier l&apos;abonnement de plein droit, sans préjudice de dommages et intérêts.</p>
        <p>Les sommes versées au titre de la période en cours restent acquises au Prestataire, sauf résiliation pour manquement de sa part.</p>
      </section>

      <section>
        <h2>Article 8 — Engagements du Prestataire</h2>
        <p>Le Prestataire est tenu d&apos;une obligation de moyens. Il s&apos;engage à :</p>
        <ul>
          <li>fournir le Service conformément à sa description et assurer sa maintenance corrective et évolutive ;</li>
          <li>héberger les Données du Client dans l&apos;Union européenne et les sauvegarder quotidiennement ;</li>
          <li>annoncer les opérations de maintenance planifiées au moins 48 heures à l&apos;avance, en les programmant autant que possible en dehors des heures de service ;</li>
          <li>assurer une assistance par e-mail (antony@skalcook.com) et par téléphone (06 63 56 61 67), les jours ouvrés de 9 h à 18 h, avec une première réponse sous 1 jour ouvré.</li>
        </ul>
        <p>Le Prestataire ne garantit pas un taux de disponibilité chiffré. Il met en œuvre les moyens raisonnables pour rétablir le Service au plus vite en cas d&apos;interruption.</p>
      </section>

      <section>
        <h2>Article 9 — Engagements du Client</h2>
        <p>Le Client s&apos;engage à :</p>
        <ul>
          <li>utiliser le Service conformément à sa destination et aux CGU, et le faire respecter par ses Utilisateurs ;</li>
          <li>garder confidentiels les identifiants de ses Utilisateurs et informer le Prestataire sans délai de toute utilisation non autorisée ;</li>
          <li>s&apos;assurer de l&apos;exactitude des données saisies et vérifier les résultats proposés par le Service (lecture automatique des factures, calculs de coûts) avant de prendre une décision ;</li>
          <li>disposer des droits nécessaires sur les données qu&apos;il importe (factures, exports de caisse, documents).</li>
        </ul>
        <p>Les décisions de gestion (prix de vente, achats, recettes) restent sous la seule responsabilité du Client.</p>
      </section>

      <section>
        <h2>Article 10 — Propriété intellectuelle</h2>
        <p>Le logiciel Skalcook, son code, sa base de données, ses évolutions et sa documentation sont et restent la propriété exclusive du Prestataire.</p>
        <p>Le Prestataire concède au Client, pour la durée de l&apos;abonnement et pour ses seuls établissements, un droit d&apos;utilisation du Service non exclusif, non cessible et non transférable. Toute reproduction, adaptation, revente ou mise à disposition à des tiers est interdite.</p>
        <p>Les suggestions, retours et demandes d&apos;évolution formulés par le Client ou ses Utilisateurs peuvent être librement intégrés au Service. Ils ne confèrent au Client aucun droit sur le logiciel, ni aucune rémunération. Les développements spécifiques réalisés sur devis restent également la propriété du Prestataire, sauf stipulation contraire du devis.</p>
      </section>

      <section>
        <h2>Article 11 — Données du Client et réversibilité</h2>
        <p>Les Données du Client restent sa propriété. Le Prestataire ne les utilise que pour fournir le Service. Il peut produire des statistiques anonymisées et agrégées sur l&apos;usage du Service, ne permettant d&apos;identifier ni le Client ni ses établissements.</p>
        <p>Lorsque les Données du Client contiennent des données personnelles, le Prestataire agit en qualité de sous-traitant au sens du RGPD. Les conditions de ce traitement sont fixées par l&apos;accord de sous-traitance des données (DPA), qui fait partie du contrat. Voir aussi la <a href="/politique-confidentialite">politique de confidentialité</a>.</p>
        <p><strong>Réversibilité.</strong> Le Client peut exporter ses données à tout moment depuis le Service. À la fin de l&apos;abonnement, il dispose de 30 jours pour les exporter ; sur demande, le Prestataire lui remet un export complet dans un format standard (CSV ou Excel). À l&apos;issue de ce délai, les Données du Client sont supprimées, sauf obligation légale de conservation ; les sauvegardes sont effacées au fil de leur rotation.</p>
      </section>

      <section>
        <h2>Article 12 — Responsabilité</h2>
        <p>Chaque partie est responsable des dommages directs qu&apos;elle cause à l&apos;autre par un manquement prouvé à ses obligations.</p>
        <p>Le Prestataire ne répond pas des dommages indirects, notamment perte de chiffre d&apos;affaires, de marge, de clientèle ou d&apos;exploitation, ni des conséquences des décisions de gestion prises par le Client à partir du Service.</p>
        <p>Toutes causes confondues, la responsabilité totale du Prestataire est plafonnée aux sommes effectivement payées par le Client au titre du Service au cours des 12 mois précédant le fait générateur. Ce plafond ne s&apos;applique pas en cas de faute lourde ou dolosive.</p>
      </section>

      <section>
        <h2>Article 13 — Force majeure</h2>
        <p>Aucune partie n&apos;est responsable d&apos;un manquement causé par un cas de force majeure au sens de l&apos;article 1218 du Code civil, y compris une défaillance généralisée des réseaux ou des hébergeurs qui ne lui est pas imputable. Si l&apos;empêchement dure plus de 30 jours, chaque partie peut résilier l&apos;abonnement sans indemnité.</p>
      </section>

      <section>
        <h2>Article 14 — Confidentialité</h2>
        <p>Chaque partie garde confidentielles les informations non publiques de l&apos;autre partie dont elle a connaissance, notamment les Données du Client, les conditions tarifaires et les informations techniques du Service, pendant la durée du contrat et 3 ans après sa fin.</p>
      </section>

      <section>
        <h2>Article 15 — Référence commerciale</h2>
        <p>Sauf opposition écrite du Client, le Prestataire peut citer le nom et le logo du Client comme référence commerciale. Il ne divulgue aucune Donnée du Client.</p>
      </section>

      <section>
        <h2>Article 16 — Modification des CGV</h2>
        <p>Le Prestataire peut modifier les CGV. Il informe le Client par e-mail au moins 30 jours avant leur entrée en vigueur. Si une modification est défavorable au Client, celui-ci peut résilier l&apos;abonnement avant son entrée en vigueur, sans préavis ni pénalité. Les prix garantis par une Commande ne sont pas modifiables pendant leur durée de garantie.</p>
      </section>

      <section>
        <h2>Article 17 — Droit applicable et litiges</h2>
        <p>Les CGV sont soumises au droit français. Les parties recherchent d&apos;abord une solution amiable. À défaut d&apos;accord dans un délai de 30 jours, tout litige relève de la compétence exclusive des tribunaux du ressort de Nanterre, y compris en cas de pluralité de défendeurs ou de procédure en référé.</p>
      </section>
    </LegalShell>
  )
}
