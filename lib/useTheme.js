'use client'
import { useState, useEffect } from 'react'
import { theme } from './theme.jsx'

export function useTheme() {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('darkMode')
    if (saved === 'true') setDarkMode(true)
  }, [])

  const toggleDarkMode = () => {
    const newValue = !darkMode
    setDarkMode(newValue)
    localStorage.setItem('darkMode', newValue.toString())
  }

  const c = darkMode ? theme.dark : theme.couleurs
  return { c, darkMode, toggleDarkMode }
}
