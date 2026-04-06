'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChefLoader from '../../../components/ChefLoader'

export default function ActivityDashboard({ activityData, activityLoading, isMobile, onLoadActivity }) {
  const [filterClient, setFilterClient] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterDevice, setFilterDevice] = useState('')

  const handleFilterChange = (client, user, device) => {
    setFilterClient(client)
    setFilterUser(user)
    setFilterDevice(device)
    onLoadActivity(client, user, device)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 2rem)', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>Activité Réelle</h1>
          <p style={{ fontSize: '14px', color: '#71717A' }}>Journal d'audit & métriques des 7 derniers jours</p>
        </div>
        <button onClick={() => onLoadActivity(filterClient, filterUser, filterDevice)} style={{
          background: '#6366F1', color: 'white', border: 'none', borderRadius: '8px',
          padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
        }}>↻ Actualiser</button>
      </div>

      {activityLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <ChefLoader message="Chargement de l'activité..." />
        </div>
      )}

      {!activityLoading && activityData && (() => {
        // Normalize: service may return { logs } or { kpis, recentLogs, chartData, ... }
        const logs = activityData.recentLogs || activityData.logs || []
        const kpis = activityData.kpis || null
        const chartData = activityData.chartData || []
        const clients = activityData.clients || []
        const users = activityData.users || []

        return (
        <>
          {/* KPI Cards */}
          {kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Utilisateurs actifs (24h)', value: kpis.activeUsers24h ?? '—', icon: '👤', color: '#6366F1', bg: '#EEF2FF' },
              { label: 'Modifications aujourd\'hui', value: kpis.modificationsToday ?? '—', icon: '✏️', color: '#D97706', bg: '#FEF3C7' },
              { label: 'Établissement le plus actif', value: kpis.topClient || '—', icon: '🏆', color: '#16A34A', bg: '#DCFCE7' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{kpi.icon}</div>
                  <span style={{ fontSize: '12px', color: '#71717A', fontWeight: '500' }}>{kpi.label}</span>
                </div>
                <div style={{ fontSize: typeof kpi.value === 'number' ? '32px' : '20px', fontWeight: '700', color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              </div>
            ))}
          </div>
          )}

          {/* Filters */}
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Établissement</div>
              <select value={filterClient} onChange={e => handleFilterChange(e.target.value, filterUser, filterDevice)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                <option value="">Tous les établissements</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nom_etablissement}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Utilisateur</div>
              <select value={filterUser} onChange={e => handleFilterChange(filterClient, e.target.value, filterDevice)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                <option value="">Tous les utilisateurs</option>
                {users.map(u => <option key={u.user_id} value={u.user_id}>{u.user_nom}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Appareil</div>
              <select value={filterDevice} onChange={e => handleFilterChange(filterClient, filterUser, e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', background: 'white', color: '#18181B', outline: 'none' }}>
                <option value="">Tous les appareils</option>
                {['iOS', 'Android', 'Windows', 'Mac', 'Linux', 'Autre'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {(filterClient || filterUser || filterDevice) && (
              <button onClick={() => handleFilterChange('', '', '')}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '0.5px solid #E4E4E7', background: '#F4F4F5', color: '#71717A', fontSize: '13px', cursor: 'pointer' }}>
                Réinitialiser
              </button>
            )}
          </div>

          {/* Chart */}
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '20px 24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#18181B', marginBottom: '4px' }}>Volume d'actions — 7 derniers jours</div>
            <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '20px' }}>Toutes actions confondues</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '12px' }} />
                <Line type="monotone" dataKey="actions" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#6366F1' }} activeDot={{ r: 5 }} name="Actions" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Audit log table */}
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#18181B' }}>Journal d'audit</div>
              <span style={{ fontSize: '12px', color: '#71717A' }}>{logs.length} dernières actions</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
                <thead>
                  <tr style={{ background: '#F4F4F5' }}>
                    {['Heure', 'Utilisateur', 'Action', 'Ressource', 'Appareil', 'Établissement'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', color: '#71717A', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>Aucune activité sur cette période</td></tr>
                  )}
                  {logs.map((log, i) => {
                    const actionColors = {
                      CREATION: { bg: '#EAF3DE', color: '#3B6D11' },
                      MODIFICATION: { bg: '#FAEEDA', color: '#854F0B' },
                      SUPPRESSION: { bg: '#FCEBEB', color: '#A32D2D' },
                      IMPORT: { bg: '#EEEDFE', color: '#3C3489' },
                      CONNEXION: { bg: '#F0E8E0', color: '#2C1810' },
                    }
                    const deviceIcons = { iOS: '📱', Android: '🤖', Windows: '🖥', Mac: '🍎', Linux: '🐧', Inconnu: '❓', Autre: '💻' }
                    const ac = actionColors[log.action] || { bg: '#F4F4F5', color: '#71717A' }
                    const clientNom = clients.find(c => c.id === log.client_id)?.nom_etablissement || log.client_id?.slice(0, 8) || '—'
                    const heure = new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    return (
                      <tr key={log.id || i} style={{ borderBottom: '0.5px solid #F4F4F5' }}>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>{heure}</td>
                        <td style={{ padding: '10px 14px', fontSize: '13px', color: '#18181B', fontWeight: '500' }}>{log.user_nom}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '20px', background: ac.bg, color: ac.color }}>{log.action}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#18181B', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.entite_nom || log.entite || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>
                          {deviceIcons[log.device] || '💻'} {log.device} · {log.browser}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#71717A', whiteSpace: 'nowrap' }}>{clientNom}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )
      })()}

      {!activityLoading && !activityData && (
        <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '60px', textAlign: 'center', color: '#71717A' }}>
          Cliquez sur "Actualiser" pour charger les données d'activité.
        </div>
      )}
    </div>
  )
}
