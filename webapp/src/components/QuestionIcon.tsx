interface QuestionIconProps {
  size?: number
  color?: string
}

export default function QuestionIcon({ size = 60, color = '#ffffff' }: QuestionIconProps) {
  return (
    <div style={{ 
      width: `${size}px`, 
      height: `${size}px`, 
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Question Mark with Head Profile */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top curve of question mark */}
        <path
          d="M 25 25 Q 25 10, 40 10 L 60 10 Q 75 10, 75 25 Q 75 35, 65 40"
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Head profile forming the curve */}
        <path
          d="M 65 40 Q 60 45, 60 50 L 60 55 Q 60 58, 63 60 L 70 65 Q 72 67, 72 70 L 72 75"
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Neck */}
        <path
          d="M 72 75 L 65 85"
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Dot at bottom */}
        <circle
          cx="50"
          cy="92"
          r="6"
          fill={color}
        />
      </svg>
    </div>
  )
}
