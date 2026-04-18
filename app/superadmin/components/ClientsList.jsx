'use client'

const MODULES_DISPONIBLES = [
  { id: 'fiches', label: 'Fiches techniques', emoji: '📝' },
  { id: 'sous-fiches', label: 'Sous-fiches', emoji: '🔗' },
  { id: 'menus', label: 'Menus', emoji: '📋' },
  { id: 'bar', label: 'Module Bar', emoji: '🍸' },
  { id: 'avis', label: 'Avis clients', emoji: '⭐' },
  { id: 'recap', label: 'Récap food cost', emoji: '📊' },
  { id: 'ingredients', label: 'Ingrédients', emoji: '🥦' },
  { id: 'ardoise', label: 'Ardoise', emoji: '🖊️' },
  { id: 'cartes', label: 'Cartes', emoji: '🍽️' },
  { id: 'gestion', label: 'Gestion', emoji: '📦' },
  { id: 'crm', label: 'CRM traiteur', emoji: '👥' },
]

export default function ClientsList({
  clients, isMobile, success,
  onNouveauClick, onModifierClick, onToggleActif, onNavigate, onInviteAdmin
}) {
  return (
    <>
      {success && (
        <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', border: '0.5px solid #BBF7D0' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>
            Établissements
          </h1>
          <p style={{ fontSize: '14px', color: '#71717A' }}>
            {clients.length} client{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onNouveauClick} style={{
          background: '#6366F1', color: 'white', border: 'none', borderRadius: '8px',
          padding: '10px 20px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
          Nouvel établissement
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!isMobile && clients.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', padding: '0 8px', marginBottom: '4px' }}>
            <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Établissement</div>
            <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</div>
          </div>
        )}

        {clients.map((client) => (
          <div key={client.id} style={{
            background: 'white', borderRadius: '12px',
            border: `0.5px solid ${client.actif ? '#E4E4E7' : '#FECACA'}`,
            padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '16px',
            opacity: client.actif ? 1 : 0.7
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {client.logo_url ? (
                <img src={client.logo_url} alt={client.nom_etablissement}
                  style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', border: '0.5px solid #E4E4E7' }} />
              ) : (
                <div style={{
                  width: '44px', height: '44px', borderRadius: '8px',
                  background: client.couleur_accent || '#6366F1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                }}>🏨</div>
              )}
              <div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>
                  {client.nom_etablissement}
                  {!client.actif && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '20px' }}>Inactif</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>
                  slug: <code style={{ background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>{client.slug}</code>
                  {client.adresse && ` — ${client.adresse}`}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(client.modules_actifs || []).map(m => {
                    const mod = MODULES_DISPONIBLES.find(md => md.id === m)
                    return mod ? (
                      <span key={m} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#EEF2FF', color: '#4338CA' }}>
                        {mod.emoji} {mod.label}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex', gap: '8px',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              width: isMobile ? '100%' : 'auto'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[client.couleur_principale, client.couleur_accent, client.couleur_fond].map((col, i) => (
                  col ? <div key={i} style={{ width: '16px', height: '16px', borderRadius: '50%', background: col, border: '0.5px solid #E4E4E7' }} /> : null
                ))}
              </div>
              <button onClick={() => onToggleActif(client.id, client.actif)} style={{
                background: client.actif ? '#FEE2E2' : '#DCFCE7', color: client.actif ? '#DC2626' : '#16A34A',
                border: 'none', borderRadius: '8px',
                padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                width: isMobile ? '100%' : 'auto'
              }}>{client.actif ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => onModifierClick(client)} style={{
                background: '#18181B', color: 'white', border: 'none', borderRadius: '8px',
                padding: isMobile ? '6px 10px' : '7px 14px', fontSize: isMobile ? '11px' : '13px', cursor: 'pointer', fontWeight: '500',
                width: isMobile ? '100%' : 'auto'
              }}>Modifier</button>
              <button onClick={() => onNavigate(`/superadmin/etablissements/${client.id}`)} style={{
                background: '#F8FAFC', color: '#0F172A', border: '0.5px solid #CBD5E1', borderRadius: '8px',
                padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                width: isMobile ? '100%' : 'auto'
              }}>KYC & Légal</button>
              <button onClick={() => {
                window.localStorage.removeItem('client_id')
                window.localStorage.removeItem('tenant')
                window.localStorage.setItem('client_id', client.id)
                setTimeout(() => { window.location.href = '/dashboard' }, 100)
              }} style={{
                background: '#EEF2FF', color: '#4338CA', border: '0.5px solid #C7D2FE', borderRadius: '8px',
                padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                width: isMobile ? '100%' : 'auto'
              }}>Accéder au Dashboard</button>
              <button onClick={() => onInviteAdmin(client)} style={{
                background: '#EEF2FF', color: '#4338CA', border: '0.5px solid #C7D2FE', borderRadius: '8px',
                padding: isMobile ? '6px 10px' : '7px 12px', fontSize: isMobile ? '11px' : '12px', cursor: 'pointer', fontWeight: '500',
                width: isMobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <span>✉️</span> Inviter Admin
              </button>
            </div>
          </div>
        ))}

        {clients.length === 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '60px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>
            Aucun établissement — créez le premier !
          </div>
        )}
      </div>
    </>
  )
}

export { MODULES_DISPONIBLES }
