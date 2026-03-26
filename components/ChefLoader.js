import React from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { theme } from '../lib/theme.jsx'

const ChefLoader = ({ message = 'Préparation en cours...', size = 200 }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ width: size, height: size }}>
        <DotLottieReact
          src="https://lottie.host/f6993c32-8fe8-46a8-adf3-1e0846de66af/uZMJ150pgU.lottie"
          loop
          autoplay
        />
      </div>
      {message && (
        <p style={{
          marginTop: '10px',
          fontSize: '14px',
          fontWeight: 600,
          color: theme.couleurs.texteMuted,
          fontFamily: 'inherit'
        }}>
          {message}
        </p>
      )}
    </div>
  )
}

export default ChefLoader
