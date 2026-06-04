// EventOS Logo component

export default function EventOSLogo({ className = "", size = 24 }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      {/* Outer Octagon */}
      <polygon points="30,10 70,10 90,30 90,70 70,90 30,90 10,70 10,30" />
      
      {/* Horizontal Lines */}
      <line x1="10" y1="30" x2="90" y2="30" />
      <line x1="10" y1="70" x2="90" y2="70" />
      
      {/* Vertical Lines */}
      <line x1="30" y1="30" x2="30" y2="70" />
      <line x1="70" y1="30" x2="70" y2="70" />
      
      {/* Top Cross */}
      <line x1="30" y1="10" x2="70" y2="30" />
      <line x1="70" y1="10" x2="30" y2="30" />
      
      {/* Bottom Cross */}
      <line x1="30" y1="90" x2="70" y2="70" />
      <line x1="70" y1="90" x2="30" y2="70" />
      
      {/* Center Pill */}
      {/* Expanded rect to ensure text isn't cut off */}
      <rect x="12" y="38" width="76" height="24" rx="12" fill="white" stroke="currentColor" strokeWidth="4" />
      
      {/* Text inside Pill */}
      <text 
        x="50" 
        y="53.5" 
        fontSize="12" 
        fontWeight="800" 
        fill="currentColor" 
        textAnchor="middle"
        stroke="none"
        style={{ letterSpacing: '0.5px', fontFamily: 'sans-serif' }}
      >
        EVENTOS
      </text>
    </svg>
  )
}
