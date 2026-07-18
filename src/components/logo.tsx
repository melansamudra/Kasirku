// CreateImpact brand mark: a "C" with a green upward arrow forming a "1"
// through its gap — reused everywhere the old plain "K" letterbox used to
// be (site headers/footers, auth panel, app-preview mockups).
export default function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-label="CreateImpact" role="img">
      <path
        d="M139,155.7 A68,68 0 1,1 139,44.3"
        fill="none"
        stroke="#171717"
        strokeWidth="32"
        strokeLinecap="round"
      />
      <path
        d="M112,145 L165,78"
        fill="none"
        stroke="#00944a"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <polygon points="178.6,60.8 177.5,87.9 152.5,68.1" fill="#00944a" />
      <line x1="158" y1="108" x2="158" y2="168" stroke="#00944a" strokeWidth="20" strokeLinecap="round" />
    </svg>
  );
}
