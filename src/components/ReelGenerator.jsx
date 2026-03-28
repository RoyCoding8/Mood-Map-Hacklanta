import { useState } from 'react'
import { getReelScript } from '../api'
import ReelPlayer from './ReelPlayer'
import './ReelPlayer.css'

export default function ReelGenerator({ pins }) {
  const [loading, setLoading] = useState(false)
  const [reelData, setReelData] = useState(null)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    if (loading || pins.length === 0) return
    setLoading(true)
    setError(null)

    try {
      const result = await getReelScript(pins)
      if (result && result.data) {
        setReelData(result.data)
      } else {
        setError('Could not generate video data. Try again.')
      }
    } catch (e) {
      setError(e.message || 'Could not generate reel script')
    }

    setLoading(false)
  }

  function handleClose() {
    setReelData(null)
  }

  return (
    <>
      <button
        className="reel-generate-btn"
        onClick={handleGenerate}
        disabled={loading || pins.length === 0}
        aria-label="Generate campus vibe check video"
      >
        <span style={{ fontSize: 17 }}>🎬</span>
        {loading ? 'Generating...' : 'Generate Campus Vibe Check'}
      </button>

      {error && (
        <div style={{
          fontSize: 12,
          color: '#d32f2f',
          background: '#ffebee',
          borderRadius: 8,
          padding: '8px 12px',
          textAlign: 'center',
          marginTop: -8,
        }}>
          {error}
        </div>
      )}

      {reelData && (
        <ReelPlayer
          data={reelData}
          onClose={handleClose}
        />
      )}
    </>
  )
}
