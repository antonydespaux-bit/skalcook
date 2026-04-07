'use client'
import ChefLoader from '../components/ChefLoader'

export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ChefLoader />
    </div>
  )
}
