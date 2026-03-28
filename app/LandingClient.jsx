'use client'

import { useEffect, useMemo } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { supabase } from '../lib/supabase'
import { isSuperadminEmail } from '../lib/superadmin'
import { useRouter } from 'next/navigation'

const SUPABASE_URL = 'https://uvmslpdcywephdneciwd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bXNscGRjeXdlcGhkbmVjaXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjM1MDAsImV4cCI6MjA4ODk5OTUwMH0._ufIYbefc70TQOe8vSh22ljk2mEbAcWXzirbib8S7EE'

// Traductions (clés = valeurs `data-i18n` présentes dans `app/landing-source.html`)
const translations = {
  fr: {
    nav_features: 'Fonctionnalités',
    nav_foodcost: 'Food cost',
    nav_contact: 'Contact',
    nav_cta: 'Se connecter',
    hero_eyebrow: 'Gestion professionnelle',
    hero_title: 'Les fiches techniques qui',
    hero_title_em: 'font la différence',
    hero_desc: 'Calculez votre food cost en temps réel, gérez vos allergènes, et pilotez vos marges sur Cuisine et Bar depuis une seule plateforme.',
    hero_cta_demo: 'Demander une démo',
    hero_cta_discover: 'Découvrir les fonctionnalités',
    badge_foodcost: 'Food cost calculé',
    badge_impression: 'Impression pro',
    kpi_fiches: 'Fiches actives',
    kpi_alertes: 'Alertes',
    kpi_prix: 'Prix modifiés',
    mock_alertes: 'Fiches en alerte',
    stat_allergenes: 'Allergènes officiels UE',
    stat_modules: 'Cuisine & Bar séparés',
    stat_etablissements: 'Établissements',
    stat_realtime: 'Temps réel',
    features_label: 'Fonctionnalités',
    features_title: 'Tout ce dont votre cuisine',
    features_title_em: 'a besoin',
    features_desc: 'Des outils pensés pour le terrain — rapides, précis et accessibles même avec les mains occupées.',
    feat1_title: 'Dashboard KPIs',
    feat1_desc: 'Visualisez votre food cost moyen, fiches en alerte, et variations de prix ingrédients en un coup d’œil.',
    feat2_title: 'Fiches techniques',
    feat2_desc: "Créez et gérez vos fiches avec photos, ingrédients, marges, allergènes et impression professionnelle A4.",
    feat3_title: 'Food cost temps réel',
    feat3_desc: 'Chaque ingrédient mis à jour se répercute instantanément sur toutes les fiches — zéro calcul manuel.',
    feat4_title: 'Module Bar intégré',
    feat4_desc: 'Section Bar dédiée avec TVA alcool automatique (20%), cocktails, vins et spiritueux gérés séparément.',
    feat5_title: 'Allergènes officiels',
    feat5_desc: 'Les 14 allergènes réglementaires UE intégrés. Tableau imprimable pour les cuisines et la salle.',
    feat6_title: 'Multi-établissements',
    feat6_desc: 'Gérez plusieurs restaurants ou hôtels depuis une seule plateforme avec isolation totale des données.',
    fc_label: 'Food cost',
    fc_title: '1% de marge, c’est',
    fc_title_em: "des milliers d'euros",
    fc_desc: 'Skalcook calcule votre food cost à la portion, intègre le % de perte matière et vous alerte quand une fiche dépasse vos seuils.',
    fc_li1: 'Prix indicatif TTC calculé automatiquement selon votre seuil cible',
    fc_li2: '% de perte matière intégré (parures, épluchage, désossage)',
    fc_li3: 'Alertes visuelles rouge/orange/vert selon vos seuils personnalisés',
    fc_li4: 'TVA automatique : 10% restauration, 20% alcool',
    fc_chart_title: 'Food cost par fiche — Temps réel',
    fc_avg: 'Moyenne globale',
    multi_label: 'Multi-établissements',
    multi_title: 'Une plateforme,',
    multi_title_em: 'tous vos restaurants',
    multi_desc: 'Chaque établissement dispose de son propre espace isolé, son branding, ses modules actifs et ses équipes.',
    badge_both: 'Cuisine + Bar',
    badge_cuisine: 'Cuisine',
    fiches: 'fiches',
    users: 'utilisateurs',
    client2_detail: 'Lyon — Brasserie traditionnelle',
    client3_detail: 'Bordeaux — Bar à cocktails',
    allerg_label: 'Conformité réglementaire',
    allerg_title: 'Les 14 allergènes',
    allerg_title_em: 'toujours à portée',
    allerg_desc: 'Sélectionnez les allergènes présents sur chaque fiche. Tableau récapitulatif imprimable pour affichage en salle et en cuisine.',
    allerg_cta: 'Demander une démo',
    al1: 'Gluten',
    al2: 'Crustacés',
    al3: 'Œufs',
    al4: 'Poisson',
    al5: 'Arachides',
    al6: 'Soja',
    al7: 'Lait',
    al8: 'F. à coque',
    al9: 'Céleri',
    al10: 'Moutarde',
    al11: 'Sésame',
    al12: 'Sulfites',
    al13: 'Mollusques',
    al14: 'Lupin',
    contact_label: 'Contact',
    contact_title: 'Prêt à reprendre le contrôle de',
    contact_title_em: 'vos marges ?',
    contact_desc: 'Remplissez le formulaire et nous vous recontactons sous 24h pour une démonstration personnalisée.',
    benefit1_title: 'Mise en place en 48h',
    benefit1_desc: 'Votre espace est configuré et votre équipe formée en moins de 2 jours.',
    benefit2_title: 'Démo personnalisée',
    benefit2_desc: "Une démonstration adaptée à votre type d'établissement et vos enjeux.",
    benefit3_title: 'Support en français',
    benefit3_desc: 'Une équipe disponible par email et téléphone pour vous accompagner.',
    testimonial_quote: '"Skalcook a transformé notre gestion. On voit en temps réel si on est rentable — c’est indispensable."',
    testimonial_author: 'Chef exécutif, Hôtel 5 étoiles Paris',
    form_title: 'Demander une démo',
    form_subtitle: 'Gratuit, sans engagement. Réponse sous 24h.',
    field_nom: 'Nom *',
    field_email: 'Email *',
    field_tel: 'Téléphone',
    field_nb_etab: 'Nombre d’établissements',
    field_etab: "Nom de l'établissement",
    field_message: 'Message',
    form_submit: 'Envoyer ma demande',
    success_title: 'Demande envoyée !',
    success_desc: 'Nous vous recontactons sous 24h pour organiser votre démonstration.',
    cta_label: 'Commencer',
    cta_title: 'Déjà utilisé dans des hôtels et restaurants',
    cta_title_em: 'exigeants',
    cta_desc: 'Rejoignez les professionnels qui ont repris le contrôle de leurs marges avec Skalcook.',
    cta_btn: 'Demander une démo gratuite',
    cta_login: 'Déjà client ? Se connecter',
    footer_copy: '© 2026 — Gestion des fiches techniques',
    footer_login: 'Se connecter',
    footer_contact: 'Contact',
    err_required: 'Veuillez remplir les champs obligatoires.',
    err_send: "Erreur lors de l’envoi. Réessayez.",
  },
  en: {
    nav_features: 'Features',
    nav_foodcost: 'Food cost',
    nav_contact: 'Contact',
    nav_cta: 'Sign in',
    hero_eyebrow: 'Professional management',
    hero_title: 'Recipe sheets that',
    hero_title_em: 'make the difference',
    hero_desc: 'Calculate your food cost in real time, manage allergens, and control your margins across Kitchen and Bar from a single platform.',
    hero_cta_demo: 'Request a demo',
    hero_cta_discover: 'Discover features',
    badge_foodcost: 'Food cost calculated',
    badge_impression: 'Pro printing',
    kpi_fiches: 'Active sheets',
    kpi_alertes: 'Alerts',
    kpi_prix: 'Updated prices',
    mock_alertes: 'Alert sheets',
    stat_allergenes: 'Official EU allergens',
    stat_modules: 'Kitchen & Bar separated',
    stat_etablissements: 'Venues',
    stat_realtime: 'Real time',
    features_label: 'Features',
    features_title: 'Everything your kitchen',
    features_title_em: 'needs',
    features_desc: 'Tools designed for the field — fast, precise and accessible even with your hands full.',
    feat1_title: 'KPI Dashboard',
    feat1_desc: 'Visualize your average food cost, alert sheets, and ingredient price variations at a glance.',
    feat2_title: 'Recipe sheets',
    feat2_desc: 'Create and manage your sheets with photos, ingredients, margins, allergens and professional A4 printing.',
    feat3_title: 'Real-time food cost',
    feat3_desc: 'Every updated ingredient instantly impacts all relevant sheets — zero manual calculation.',
    feat4_title: 'Integrated Bar module',
    feat4_desc: 'Dedicated Bar section with automatic alcohol VAT (20%), cocktails, wines and spirits managed separately.',
    feat5_title: 'Official allergens',
    feat5_desc: 'All 14 EU regulatory allergens integrated. Printable table for kitchen and dining room.',
    feat6_title: 'Multi-venue',
    feat6_desc: 'Manage multiple restaurants or hotels from a single platform with complete data isolation.',
    fc_label: 'Food cost',
    fc_title: '1% margin is',
    fc_title_em: 'thousands of euros',
    fc_desc: 'Skalcook calculates your food cost per serving, integrates waste percentage and alerts you when a sheet exceeds your thresholds.',
    fc_li1: 'Automatic VAT price suggestion based on your target margin',
    fc_li2: 'Waste percentage integrated (trimming, peeling, boning)',
    fc_li3: 'Red/orange/green visual alerts based on your custom thresholds',
    fc_li4: 'Automatic VAT: 10% catering, 20% alcohol',
    fc_chart_title: 'Food cost per sheet — Real time',
    fc_avg: 'Global average',
    multi_label: 'Multi-venue',
    multi_title: 'One platform,',
    multi_title_em: 'all your restaurants',
    multi_desc: 'Each venue has its own isolated space, branding, active modules and teams.',
    badge_both: 'Kitchen + Bar',
    badge_cuisine: 'Kitchen',
    fiches: 'sheets',
    users: 'users',
    client2_detail: 'Lyon — Traditional brasserie',
    client3_detail: 'Bordeaux — Cocktail bar',
    allerg_label: 'Regulatory compliance',
    allerg_title: 'All 14 allergens',
    allerg_title_em: 'always at hand',
    allerg_desc: 'Select allergens present on each sheet. Printable summary table for display in dining room and kitchen.',
    allerg_cta: 'Request a demo',
    al1: 'Gluten',
    al2: 'Crustaceans',
    al3: 'Eggs',
    al4: 'Fish',
    al5: 'Peanuts',
    al6: 'Soy',
    al7: 'Milk',
    al8: 'Tree nuts',
    al9: 'Celery',
    al10: 'Mustard',
    al11: 'Sesame',
    al12: 'Sulphites',
    al13: 'Molluscs',
    al14: 'Lupin',
    contact_label: 'Contact',
    contact_title: 'Ready to take control of',
    contact_title_em: 'your margins?',
    contact_desc: 'Fill out the form and we will contact you within 24 hours for a personalized demonstration.',
    benefit1_title: 'Set up in 48h',
    benefit1_desc: 'Your space is configured and your team trained in less than 2 days.',
    benefit2_title: 'Personalized demo',
    benefit2_desc: 'A demonstration tailored to your type of establishment and challenges.',
    benefit3_title: 'Support in your language',
    benefit3_desc: 'A team available by email and phone to support you.',
    testimonial_quote: '"Skalcook transformed our management. We see in real time if we\'re profitable — it\'s essential."',
    testimonial_author: 'Executive Chef, 5-star Hotel Paris',
    form_title: 'Request a demo',
    form_subtitle: 'Free, no commitment. Reply within 24h.',
    field_nom: 'Name *',
    field_email: 'Email *',
    field_tel: 'Phone',
    field_nb_etab: 'Number of venues',
    field_etab: 'Venue name',
    field_message: 'Message',
    form_submit: 'Send my request',
    success_title: 'Request sent!',
    success_desc: 'We will contact you within 24h to organize your demonstration.',
    cta_label: 'Get started',
    cta_title: 'Already used in demanding hotels and',
    cta_title_em: 'restaurants',
    cta_desc: 'Join the professionals who have taken control of their margins with Skalcook.',
    cta_btn: 'Request a free demo',
    cta_login: 'Already a client? Sign in',
    footer_copy: '© 2026 — Recipe sheet management',
    footer_login: 'Sign in',
    footer_contact: 'Contact',
    err_required: 'Please fill in the required fields.',
    err_send: 'Error sending. Please try again.',
  },
  es: {
    nav_features: 'Funciones',
    nav_foodcost: 'Food cost',
    nav_contact: 'Contacto',
    nav_cta: 'Iniciar sesión',
    hero_eyebrow: 'Gestión profesional',
    hero_title: 'Las fichas técnicas que',
    hero_title_em: 'marcan la diferencia',
    hero_desc: 'Calcula tu food cost en tiempo real, gestiona los alérgenos y controla tus márgenes en Cocina y Bar desde una sola plataforma.',
    hero_cta_demo: 'Solicitar una demo',
    hero_cta_discover: 'Descubrir funciones',
    badge_foodcost: 'Food cost calculado',
    badge_impression: 'Impresión pro',
    kpi_fiches: 'Fichas activas',
    kpi_alertes: 'Alertas',
    kpi_prix: 'Precios modificados',
    mock_alertes: 'Fichas en alerta',
    stat_allergenes: 'Alérgenos oficiales UE',
    stat_modules: 'Cocina & Bar separados',
    stat_etablissements: 'Establecimientos',
    stat_realtime: 'Tiempo real',
    features_label: 'Funciones',
    features_title: 'Todo lo que tu cocina',
    features_title_em: 'necesita',
    features_desc: 'Herramientas pensadas para el terreno — rápidas, precisas y accesibles incluso con las manos ocupadas.',
    feat1_title: 'Dashboard KPIs',
    feat1_desc: 'Visualiza tu food cost medio, fichas en alerta y variaciones de precios de ingredientes de un vistazo.',
    feat2_title: 'Fichas técnicas',
    feat2_desc: 'Crea y gestiona tus fichas con fotos, ingredientes, márgenes, alérgenos e impresión profesional A4.',
    feat3_title: 'Food cost en tiempo real',
    feat3_desc: 'Cada ingrediente actualizado impacta instantáneamente en todas las fichas — cero cálculo manual.',
    feat4_title: 'Módulo Bar integrado',
    feat4_desc: 'Sección Bar dedicada con IVA alcohol automático (20%), cócteles, vinos y espirituosos gestionados por separado.',
    feat5_title: 'Alérgenos oficiales',
    feat5_desc: 'Los 14 alérgenos reglamentarios UE integrados. Tabla imprimible para cocina y sala.',
    feat6_title: 'Multi-establecimiento',
    feat6_desc: 'Gestiona varios restaurantes u hoteles desde una sola plataforma con aislamiento total de datos.',
    fc_label: 'Food cost',
    fc_title: 'Un 1% de margen son',
    fc_title_em: 'miles de euros',
    fc_desc: 'Skalcook calcula tu food cost por ración, integra el % de merma y te alerta cuando una ficha supera tus umbrales.',
    fc_li1: 'Precio de venta IVA incluido calculado automáticamente según tu umbral objetivo',
    fc_li2: '% de merma integrado (recortes, pelado, deshuesado)',
    fc_li3: 'Alertas visuales rojo/naranja/verde según tus umbrales personalizados',
    fc_li4: 'IVA automático: 10% restauración, 20% alcohol',
    fc_chart_title: 'Food cost por ficha — Tiempo real',
    fc_avg: 'Media global',
    multi_label: 'Multi-establecimiento',
    multi_title: 'Una plataforma,',
    multi_title_em: 'todos tus restaurantes',
    multi_desc: 'Cada establecimiento dispone de su propio espacio aislado, branding, módulos activos y equipos.',
    badge_both: 'Cocina + Bar',
    badge_cuisine: 'Cocina',
    fiches: 'fichas',
    users: 'usuarios',
    client2_detail: 'Lyon — Brasería tradicional',
    client3_detail: 'Burdeos — Bar de cócteles',
    allerg_label: 'Cumplimiento normativo',
    allerg_title: 'Los 14 alérgenos',
    allerg_title_em: 'siempre a mano',
    allerg_desc: 'Selecciona los alérgenos presentes en cada ficha. Tabla resumen imprimible para exposición en sala y cocina.',
    allerg_cta: 'Solicitar una demo',
    al1: 'Gluten',
    al2: 'Crustáceos',
    al3: 'Huevos',
    al4: 'Pescado',
    al5: 'Cacahuetes',
    al6: 'Soja',
    al7: 'Leche',
    al8: 'Frutos secos',
    al9: 'Apio',
    al10: 'Mostaza',
    al11: 'Sésamo',
    al12: 'Sulfitos',
    al13: 'Moluscos',
    al14: 'Lupino',
    contact_label: 'Contacto',
    contact_title: '¿Listo para recuperar el control de',
    contact_title_em: 'tus márgenes?',
    contact_desc: 'Rellena el formulario y te contactamos en 24h para una demostración personalizada.',
    benefit1_title: 'Puesta en marcha en 48h',
    benefit1_desc: 'Tu espacio configurado y tu equipo formado en menos de 2 días.',
    benefit2_title: 'Demo personalizada',
    benefit2_desc: 'Una demostración adaptada a tu tipo de establecimiento y retos.',
    benefit3_title: 'Soporte en tu idioma',
    benefit3_desc: 'Un equipo disponible por email y teléfono para acompañarte.',
    testimonial_quote: '"Skalcook transformó nuestra gestión. Vemos en tiempo real si somos rentables — es imprescindible."',
    testimonial_author: 'Chef ejecutivo, Hotel 5 estrellas París',
    form_title: 'Solicitar una demo',
    form_subtitle: 'Gratis, sin compromiso. Respuesta en 24h.',
    field_nom: 'Nombre *',
    field_email: 'Email *',
    field_tel: 'Teléfono',
    field_nb_etab: 'Número de establecimientos',
    field_etab: 'Nombre del establecimiento',
    field_message: 'Mensaje',
    form_submit: 'Enviar mi solicitud',
    success_title: '¡Solicitud enviada!',
    success_desc: 'Te contactamos en 24h para organizar tu demostración.',
    cta_label: 'Empezar',
    cta_title: 'Ya utilizado en hoteles y restaurantes',
    cta_title_em: 'exigentes',
    cta_desc: 'Únete a los profesionales que han recuperado el control de sus márgenes con Skalcook.',
    cta_btn: 'Solicitar una demo gratuita',
    cta_login: '¿Ya eres cliente? Iniciar sesión',
    footer_copy: '© 2026 — Gestión de fichas técnicas',
    footer_login: 'Iniciar sesión',
    footer_contact: 'Contacto',
    err_required: 'Por favor, rellena los campos obligatorios.',
    err_send: 'Error al enviar. Inténtalo de nuevo.',
  },
  it: {
    nav_features: 'Funzionalità',
    nav_foodcost: 'Food cost',
    nav_contact: 'Contatto',
    nav_cta: 'Accedi',
    hero_eyebrow: 'Gestione professionale',
    hero_title: 'Le schede tecniche che',
    hero_title_em: 'fanno la differenza',
    hero_desc: 'Calcola il tuo food cost in tempo reale, gestisci gli allergeni e controlla i tuoi margini su Cucina e Bar da un\'unica piattaforma.',
    hero_cta_demo: 'Richiedi una demo',
    hero_cta_discover: 'Scopri le funzionalità',
    badge_foodcost: 'Food cost calcolato',
    badge_impression: 'Stampa pro',
    kpi_fiches: 'Schede attive',
    kpi_alertes: 'Avvisi',
    kpi_prix: 'Prezzi modificati',
    mock_alertes: 'Schede in avviso',
    stat_allergenes: 'Allergeni ufficiali UE',
    stat_modules: 'Cucina & Bar separati',
    stat_etablissements: 'Strutture',
    stat_realtime: 'Tempo reale',
    features_label: 'Funzionalità',
    features_title: 'Tutto ciò di cui la tua cucina',
    features_title_em: 'ha bisogno',
    features_desc: 'Strumenti pensati per il campo — veloci, precisi e accessibili anche con le mani occupate.',
    feat1_title: 'Dashboard KPI',
    feat1_desc: 'Visualizza il tuo food cost medio, le schede in allerta e le variazioni di prezzo degli ingredienti in un colpo d\'occhio.',
    feat2_title: 'Schede tecniche',
    feat2_desc: 'Crea e gestisci le tue schede con foto, ingredienti, margini, allergeni e stampa professionale A4.',
    feat3_title: 'Food cost in tempo reale',
    feat3_desc: 'Ogni ingrediente aggiornato si ripercuote istantaneamente su tutte le schede — zero calcoli manuali.',
    feat4_title: 'Modulo Bar integrato',
    feat4_desc: 'Sezione Bar dedicata con IVA alcool automatica (22%), cocktail, vini e spirits gestiti separatamente.',
    feat5_title: 'Allergeni ufficiali',
    feat5_desc: 'I 14 allergeni normativi UE integrati. Tabella stampabile per esposizione in sala e cucina.',
    feat6_title: 'Multi-struttura',
    feat6_desc: 'Gestisci più ristoranti o hotel da un\'unica piattaforma con isolamento totale dei dati.',
    fc_label: 'Food cost',
    fc_title: "L'1% di margine sono",
    fc_title_em: 'migliaia di euro',
    fc_desc: 'Skalcook calcola il tuo food cost per porzione, integra la % di scarto e ti avvisa quando una scheda supera le tue soglie.',
    fc_li1: 'Prezzo IVA inclusa calcolato automaticamente in base alla tua soglia obiettivo',
    fc_li2: '% di scarto integrata (rifilature, sbucciatura, disossatura)',
    fc_li3: 'Avvisi visivi rosso/arancio/verde in base alle soglie personalizzate',
    fc_li4: 'IVA automatica: 10% ristorazione, 22% alcolici',
    fc_chart_title: 'Food cost per scheda — Tempo reale',
    fc_avg: 'Media globale',
    multi_label: 'Multi-struttura',
    multi_title: 'Una piattaforma,',
    multi_title_em: 'tutti i tuoi ristoranti',
    multi_desc: 'Ogni struttura ha il proprio spazio isolato, branding, moduli attivi e team.',
    badge_both: 'Cucina + Bar',
    badge_cuisine: 'Cucina',
    fiches: 'schede',
    users: 'utenti',
    client2_detail: 'Lione — Brasserie tradizionale',
    client3_detail: 'Bordeaux — Bar cocktail',
    allerg_label: 'Conformità normativa',
    allerg_title: 'I 14 allergeni',
    allerg_title_em: 'sempre a portata di mano',
    allerg_desc: 'Seleziona gli allergeni presenti in ogni scheda. Tabella riassuntiva stampabile per esposizione in sala e cucina.',
    allerg_cta: 'Richiedi una demo',
    al1: 'Glutine',
    al2: 'Crostacei',
    al3: 'Uova',
    al4: 'Pesce',
    al5: 'Arachidi',
    al6: 'Soia',
    al7: 'Latte',
    al8: 'Frutta a guscio',
    al9: 'Sedano',
    al10: 'Senape',
    al11: 'Sesamo',
    al12: 'Solfiti',
    al13: 'Molluschi',
    al14: 'Lupino',
    contact_label: 'Contatto',
    contact_title: 'Pronto a riprendere il controllo dei',
    contact_title_em: 'tuoi margini?',
    contact_desc: 'Compila il modulo e ti ricontattiamo entro 24h per una dimostrazione personalizzata.',
    benefit1_title: 'Configurazione in 48h',
    benefit1_desc: 'Il tuo spazio configurato e il tuo team formato in meno di 2 giorni.',
    benefit2_title: 'Demo personalizzata',
    benefit2_desc: 'Una dimostrazione adattata al tuo tipo di struttura e alle tue esigenze.',
    benefit3_title: 'Supporto nella tua lingua',
    benefit3_desc: 'Un team disponibile via email e telefono per accompagnarti.',
    testimonial_quote: '"Skalcook ha trasformato la nostra gestione. Vediamo in tempo reale se siamo redditizi — è indispensabile."',
    testimonial_author: 'Chef esecutivo, Hotel 5 stelle Parigi',
    form_title: 'Richiedi una demo',
    form_subtitle: 'Gratuito, senza impegno. Risposta entro 24h.',
    field_nom: 'Nome *',
    field_email: 'Email *',
    field_tel: 'Telefono',
    field_nb_etab: 'Numero di strutture',
    field_etab: 'Nome della struttura',
    field_message: 'Messaggio',
    form_submit: 'Invia la mia richiesta',
    success_title: 'Richiesta inviata!',
    success_desc: 'Ti ricontattiamo entro 24h per organizzare la tua dimostrazione.',
    cta_label: 'Inizia',
    cta_title: 'Già utilizzato in hotel e ristoranti',
    cta_title_em: 'esigenti',
    cta_desc: 'Unisciti ai professionisti che hanno ripreso il controllo dei loro margini con Skalcook.',
    cta_btn: 'Richiedi una demo gratuita',
    cta_login: 'Già cliente? Accedi',
    footer_copy: '© 2026 — Gestione schede tecniche',
    footer_login: 'Accedi',
    footer_contact: 'Contatto',
    err_required: 'Si prega di compilare i campi obbligatori.',
    err_send: 'Errore durante l\'invio. Riprova.',
  },
}

function safeSetText(el, text) {
  if (!el) return
  el.textContent = text
}

export default function LandingClient({ markup }) {
  const html = useMemo(() => markup || '', [markup])
  const router = useRouter()

  useEffect(() => {
    let currentLang = (document.documentElement.getAttribute('lang') || 'fr').toLowerCase().trim()

    // Si un utilisateur est connecté, on force le CTA "Aller au Dashboard".
    // On mémorise la cible pour que le texte/href restent correct après changement de langue.
    let dashboardOverride = null // { target: string }

    const applyDashboardOverride = () => {
      if (!dashboardOverride) return
      const target = dashboardOverride.target

      const setLink = (selector) => {
        const el = document.querySelector(selector)
        if (!el) return
        if (el.tagName === 'A') el.setAttribute('href', target)
        else if (el.parentElement && el.parentElement.tagName === 'A') el.parentElement.setAttribute('href', target)
      }

      // nav: <a class="nav-cta" data-i18n="nav_cta">...</a>
      setLink('a[data-i18n="nav_cta"]')
      // cta: <span data-i18n="cta_login">...</span> (wrapped in an <a>)
      setLink('span[data-i18n="cta_login"]')
      // footer: <a class="footer-link" data-i18n="footer_login">...</a>
      setLink('a[data-i18n="footer_login"]')

      // Texte (toujours en FR comme demandé dans les étapes précédentes)
      const label = 'Aller au Dashboard'
      const navCta = document.querySelector('a[data-i18n="nav_cta"]')
      if (navCta) navCta.textContent = label
      const ctaLogin = document.querySelector('span[data-i18n="cta_login"]')
      if (ctaLogin) ctaLogin.textContent = label
      const footerLogin = document.querySelector('a[data-i18n="footer_login"]')
      if (footerLogin) footerLogin.textContent = label
    }

    // "lang toggle" (inline onclick="setLang('fr')")
    const setLang = (lang) => {
      const safeLang = String(lang || '').toLowerCase().trim()
      currentLang = safeLang

      const upper = String(safeLang || '').toUpperCase()
      document.querySelectorAll('.lang-btn').forEach((b) => {
        const label = (b.textContent || '').trim()
        b.classList.toggle('active', label === upper)
      })

      document.documentElement.lang = safeLang

      // Apply translations for all elements using data-i18n.
      const t = translations[safeLang]
      if (t) {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n')
          const value = key ? t[key] : null
          if (value) el.textContent = value
        })
      }

      // Re-apply override after language switch.
      applyDashboardOverride()
    }

    // "contact form" (inline onclick="submitForm()")
    const submitForm = async () => {
      const nomInput = document.getElementById('fNom')
      const emailInput = document.getElementById('fEmail')
      const errEl = document.getElementById('formError')
      const btn = document.getElementById('formSubmit')
      const txt = document.getElementById('submitText')

      const nom = (nomInput?.value || '').trim()
      const email = (emailInput?.value || '').trim()
      const t = translations[currentLang] || translations.fr

      if (errEl) errEl.style.display = 'none'
      if (!nom || !email) {
        safeSetText(errEl, t.err_required)
        if (errEl) errEl.style.display = 'block'
        return
      }

      if (btn) btn.disabled = true
      if (txt) txt.textContent = '...'

      try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/prospects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            nom,
            email,
            telephone: document.getElementById('fTel')?.value.trim() || null,
            nb_etablissements: parseInt(document.getElementById('fNbEtab')?.value, 10) || 1,
            nom_etablissement: document.getElementById('fEtab')?.value.trim() || null,
            message: document.getElementById('fMessage')?.value.trim() || null,
            langue: document.documentElement.lang || 'fr',
            statut: 'nouveau',
          }),
        })

        if (!res.ok) throw new Error('Bad response')

        // UI success
        const formContent = document.getElementById('formContent')
        const formSuccess = document.getElementById('formSuccess')
        if (formContent) formContent.style.display = 'none'
        if (formSuccess) formSuccess.style.display = 'block'
      } catch (e) {
        const t = translations[currentLang] || translations.fr
        safeSetText(errEl, t.err_send)
        if (errEl) errEl.style.display = 'block'
      } finally {
        if (btn) btn.disabled = false
        if (txt) txt.textContent = t.form_submit
      }
    }

    // Register globals used by inline handlers
    window.setLang = setLang
    window.submitForm = submitForm

    // Animation reveal (IntersectionObserver)
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible')
        }),
      { threshold: 0.1 },
    )
    document.querySelectorAll('.fade-up').forEach((el) => obs.observe(el))

    // Emulate <Link>: route client-side for internal absolute URLs.
    const onDocClick = (e) => {
      const target = e.target
      const a = target instanceof Element ? target.closest('a') : null
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href.startsWith('/') || href.startsWith('#')) return
      // Let browser handle things like mailto:, external links, etc.
      if (href === '/favicon.ico') return
      e.preventDefault()
      router.push(href)
    }
    document.addEventListener('click', onDocClick)

    // If user is already logged-in, swap landing CTA to dashboard.
    const swapLandingCta = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) return

        const email = (user.email || '').toLowerCase().trim()
        let target = '/choix'

        if (isSuperadminEmail(email)) {
          target = '/superadmin'
        } else {
          try {
            const { data: profil } = await supabase
              .from('profils')
              .select('role')
              .eq('id', user.id)
              .maybeSingle()

            if (profil?.role === 'cuisine') target = '/dashboard'
            else if (profil?.role === 'bar') target = '/bar/dashboard'
          } catch {
            // Keep fallback /choix if RLS blocks profiles query
          }
        }

        dashboardOverride = { target }
        applyDashboardOverride()
      } catch {
        // no-op
      }
    }
    swapLandingCta()

    return () => {
      window.setLang = undefined
      window.submitForm = undefined
      obs.disconnect()
      document.removeEventListener('click', onDocClick)
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
}

