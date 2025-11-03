interface MicIconProps {
  size?: number
  color?: string
  showWaves?: boolean
}

export default function MicIcon({ size = 60, color = '#ffffff', showWaves = true }: MicIconProps) {
  return (
    <div style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Sound Waves */}
      {showWaves && (
        <>
          <div style={{
            position: 'absolute',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${size * 0.7}px`,
            height: `${size * 0.12}px`,
            background: color,
            borderRadius: `${size}px`,
          }} />
          <div style={{
            position: 'absolute',
            top: `${size * 0.15}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${size * 0.55}px`,
            height: `${size * 0.12}px`,
            background: color,
            borderRadius: `${size}px`,
          }} />
          <div style={{
            position: 'absolute',
            top: `${size * 0.3}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${size * 0.4}px`,
            height: `${size * 0.12}px`,
            background: color,
            borderRadius: `${size}px`,
          }} />
        </>
      )}

      {/* Microphone Body */}
      <div style={{
        position: 'absolute',
        top: `${size * 0.45}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${size * 0.35}px`,
        height: `${size * 0.45}px`,
        background: color,
        borderRadius: `${size * 0.2}px ${size * 0.2}px 0 0`,
      }} />

      {/* Microphone Arc */}
      <div style={{
        position: 'absolute',
        bottom: `${size * 0.15}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${size * 0.5}px`,
        height: `${size * 0.35}px`,
        border: `${size * 0.08}px solid ${color}`,
        borderTop: 'none',
        borderRadius: `0 0 ${size * 0.3}px ${size * 0.3}px`,
      }} />

      {/* Microphone Stand */}
      <div style={{
        position: 'absolute',
        bottom: `${size * 0.05}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${size * 0.08}px`,
        height: `${size * 0.15}px`,
        background: color,
      }} />

      {/* Microphone Base */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${size * 0.4}px`,
        height: `${size * 0.08}px`,
        background: color,
        borderRadius: `${size * 0.04}px`,
      }} />
    </div>
  )
}
