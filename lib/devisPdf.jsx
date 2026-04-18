/* eslint-disable react/no-unknown-property */
// Composant React-PDF pour la génération de devis.
//
// Rendu simple et sobre (imprimable N&B sans perte d'info). Pas de dépendance
// à un logo tant que la colonne clients.logo_url n'existe pas.
//
// Tous les montants passés en props sont supposés déjà calculés côté serveur
// (totaux cohérents avec la DB).

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  formatMontant, formatDateFr, clientDisplayName, STATUTS_DEVIS_MAP,
} from './crmConstants'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1f2937',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottom: '1 solid #e5e7eb',
    paddingBottom: 12,
    marginBottom: 18,
  },
  tenantBlock: { flexDirection: 'column', maxWidth: 260 },
  tenantName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  tenantLine: { color: '#6b7280', lineHeight: 1.4 },

  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2, textAlign: 'right' },
  numeroLine: { fontSize: 11, textAlign: 'right', color: '#374151', marginBottom: 2 },
  metaLine: { color: '#6b7280', textAlign: 'right' },

  clientBox: {
    border: '1 solid #e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 10,
    marginBottom: 18,
    width: '55%',
    alignSelf: 'flex-end',
  },
  clientLabel: { color: '#6b7280', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  clientName: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 2 },
  clientLine: { color: '#374151', lineHeight: 1.4 },

  table: { marginBottom: 12 },
  thead: {
    flexDirection: 'row',
    borderBottom: '1 solid #1f2937',
    paddingBottom: 4,
    marginBottom: 4,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  tr: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #e5e7eb',
    paddingVertical: 5,
  },
  td: { paddingRight: 4 },

  colDesignation: { width: '46%' },
  colQte:         { width: '8%',  textAlign: 'right' },
  colPu:          { width: '14%', textAlign: 'right' },
  colTva:         { width: '10%', textAlign: 'right' },
  colRemise:      { width: '8%',  textAlign: 'right' },
  colTotal:       { width: '14%', textAlign: 'right' },

  description: { color: '#6b7280', fontSize: 8, marginTop: 2 },
  allergene: { color: '#991b1b', fontSize: 7, marginTop: 2 },

  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  totalsLabel: { width: 120, textAlign: 'right', paddingRight: 10, color: '#6b7280' },
  totalsValue: { width: 80, textAlign: 'right', color: '#1f2937' },
  totalsTTC: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginTop: 4,
    paddingTop: 6,
    borderTop: '1 solid #1f2937',
  },

  section: { marginTop: 18 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paragraph: { color: '#374151', lineHeight: 1.5 },

  signatureBox: {
    marginTop: 24,
    border: '1 solid #e5e7eb',
    padding: 12,
    width: '50%',
    alignSelf: 'flex-end',
  },
  signatureTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  signatureHint: { color: '#6b7280', fontSize: 8 },

  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 6,
    fontSize: 7,
    color: '#9ca3af',
    textAlign: 'center',
  },
})

/**
 * Props :
 *   tenant    : { nom, nom_etablissement, adresse_siege, siret, num_tva, email_contact, telephone_contact }
 *   client    : crm_client row (customer)
 *   devis     : crm_devis row
 *   lignes    : crm_devis_lignes rows (ordered)
 */
export function DevisPdf({ tenant, client, devis, lignes }) {
  const statut = STATUTS_DEVIS_MAP[devis.statut]
  const tvaByRate = regrouperTvaParTaux(lignes)
  const tenantNom = tenant?.nom_etablissement || tenant?.nom || 'Établissement'

  return (
    <Document title={`Devis ${devis.numero}`} author={tenantNom} creator="Skalcook">
      <Page size="A4" style={styles.page}>
        {/* ─── Header ─── */}
        <View style={styles.headerRow}>
          <View style={styles.tenantBlock}>
            <Text style={styles.tenantName}>{tenantNom}</Text>
            {tenant?.adresse_siege && <Text style={styles.tenantLine}>{tenant.adresse_siege}</Text>}
            {tenant?.telephone_contact && <Text style={styles.tenantLine}>Tél. {tenant.telephone_contact}</Text>}
            {tenant?.email_contact && <Text style={styles.tenantLine}>{tenant.email_contact}</Text>}
            {tenant?.siret && <Text style={styles.tenantLine}>SIRET {tenant.siret}</Text>}
            {tenant?.num_tva && <Text style={styles.tenantLine}>TVA intracom. {tenant.num_tva}</Text>}
          </View>
          <View>
            <Text style={styles.title}>DEVIS</Text>
            <Text style={styles.numeroLine}>{devis.numero}</Text>
            <Text style={styles.metaLine}>Émis le {formatDateFr(devis.date_emission)}</Text>
            {devis.date_validite && <Text style={styles.metaLine}>Valable jusqu’au {formatDateFr(devis.date_validite)}</Text>}
            {statut && statut.key !== 'brouillon' && (
              <Text style={[styles.metaLine, { marginTop: 4, fontFamily: 'Helvetica-Bold', color: '#374151' }]}>
                Statut : {statut.label}
              </Text>
            )}
          </View>
        </View>

        {/* ─── Client ─── */}
        {client && (
          <View style={styles.clientBox}>
            <Text style={styles.clientLabel}>Destinataire</Text>
            <Text style={styles.clientName}>{clientDisplayName(client)}</Text>
            {(client.adresse || client.code_postal || client.ville) && (
              <Text style={styles.clientLine}>
                {[client.adresse, [client.code_postal, client.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
              </Text>
            )}
            {client.email && <Text style={styles.clientLine}>{client.email}</Text>}
            {client.telephone && <Text style={styles.clientLine}>{client.telephone}</Text>}
            {client.siret && <Text style={styles.clientLine}>SIRET {client.siret}</Text>}
          </View>
        )}

        {/* ─── Tableau lignes ─── */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
            <Text style={[styles.th, styles.colQte]}>Qté</Text>
            <Text style={[styles.th, styles.colPu]}>PU HT</Text>
            <Text style={[styles.th, styles.colTva]}>TVA</Text>
            <Text style={[styles.th, styles.colRemise]}>Remise</Text>
            <Text style={[styles.th, styles.colTotal]}>Total HT</Text>
          </View>
          {lignes.map((l) => (
            <View key={l.id || l.ordre} style={styles.tr} wrap={false}>
              <View style={[styles.td, styles.colDesignation]}>
                <Text>{l.designation}</Text>
                {l.description && <Text style={styles.description}>{l.description}</Text>}
                {Array.isArray(l.allergenes) && l.allergenes.length > 0 && (
                  <Text style={styles.allergene}>Allergènes : {l.allergenes.join(', ')}</Text>
                )}
              </View>
              <Text style={[styles.td, styles.colQte]}>{formatQte(l.quantite)}</Text>
              <Text style={[styles.td, styles.colPu]}>{formatMontant(l.prix_unitaire_ht)}</Text>
              <Text style={[styles.td, styles.colTva]}>{formatTvaLabel(l.tva_taux)}</Text>
              <Text style={[styles.td, styles.colRemise]}>{l.remise_pct ? `${l.remise_pct} %` : '—'}</Text>
              <Text style={[styles.td, styles.colTotal]}>{formatMontant(l.total_ht)}</Text>
            </View>
          ))}
        </View>

        {/* ─── Totaux ─── */}
        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total HT</Text>
            <Text style={styles.totalsValue}>{formatMontant(devis.total_ht)}</Text>
          </View>
          {tvaByRate.map(({ taux, montant }) => (
            <View key={taux} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>TVA {formatTvaLabel(taux)}</Text>
              <Text style={styles.totalsValue}>{formatMontant(montant)}</Text>
            </View>
          ))}
          <View style={[styles.totalsRow, styles.totalsTTC]}>
            <Text style={styles.totalsLabel}>Total TTC</Text>
            <Text style={styles.totalsValue}>{formatMontant(devis.total_ttc)}</Text>
          </View>
        </View>

        {/* ─── Conditions / acompte / notes ─── */}
        {(devis.conditions_paiement || devis.acompte_pourcentage != null) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            {devis.conditions_paiement && (
              <Text style={styles.paragraph}>{devis.conditions_paiement}</Text>
            )}
            {devis.acompte_pourcentage != null && (
              <Text style={styles.paragraph}>
                Acompte de {devis.acompte_pourcentage} % à la commande, soit {formatMontant((Number(devis.total_ttc) * Number(devis.acompte_pourcentage)) / 100)}.
              </Text>
            )}
          </View>
        )}

        {/* ─── Signature ─── */}
        <View style={styles.signatureBox}>
          <Text style={styles.signatureTitle}>Bon pour accord</Text>
          <Text style={styles.signatureHint}>Date + signature précédée de « Bon pour accord »</Text>
        </View>

        {/* ─── Footer ─── */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => (
            `${tenantNom}${tenant?.siret ? ` · SIRET ${tenant.siret}` : ''} — Devis ${devis.numero} — Page ${pageNumber}/${totalPages}`
          )}
          fixed
        />
      </Page>
    </Document>
  )
}

function formatQte(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

function formatTvaLabel(taux) {
  const v = Number(taux)
  if (!Number.isFinite(v)) return '—'
  return `${v.toString().replace('.', ',')} %`
}

function regrouperTvaParTaux(lignes) {
  const map = new Map()
  for (const l of lignes) {
    const t = Number(l.tva_taux) || 0
    const m = Number(l.total_tva) || 0
    map.set(t, (map.get(t) || 0) + m)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([taux, montant]) => ({ taux, montant: Math.round(montant * 100) / 100 }))
}
