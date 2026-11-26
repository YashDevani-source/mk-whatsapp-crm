// DEMO-06 login artwork: a flat Skyline Realty scene (waves, towers, chat bubbles) in the theme's
// blue and amber. Decorative only; the form beside it carries every word that matters.

const TOWERS = [
  { x: 24, y: 470, w: 96, fill: '#101a3d' },
  { x: 128, y: 392, w: 72, fill: '#18286a' },
  { x: 208, y: 520, w: 112, fill: '#1c2f78' },
  { x: 328, y: 604, w: 64, fill: '#101a3d' },
] as const;

// Lit and dark windows in a fixed pattern, so the picture is the same on every load.
function windows(tower: (typeof TOWERS)[number], index: number) {
  const cells = [];
  const cols = Math.floor((tower.w - 16) / 18);
  for (let row = 0; tower.y + 22 + row * 26 < 700; row++) {
    for (let col = 0; col < cols; col++) {
      const lit = (row * 3 + col * 5 + index * 7) % 4 !== 0;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={tower.x + 12 + col * 18}
          y={tower.y + 22 + row * 26}
          width={9}
          height={13}
          rx={2}
          fill={lit ? '#f6c96f' : '#2a3f86'}
          opacity={lit ? 0.92 : 1}
        />,
      );
    }
  }
  return cells;
}

export function LoginArt() {
  return (
    <svg
      className="login-art"
      viewBox="0 0 600 760"
      preserveAspectRatio="xMinYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="login-sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a66e6" />
          <stop offset="0.55" stopColor="#2647b8" />
          <stop offset="1" stopColor="#14225c" />
        </linearGradient>
      </defs>

      {/* The wave that holds the scene, with its light rim and splashes */}
      <path
        d="M0 0H300C250 60 330 120 300 190C270 260 380 300 420 380C460 460 400 540 470 620C510 670 520 720 540 760H0Z"
        fill="url(#login-sea)"
      />
      <path
        d="M318 -10C268 60 348 120 318 190C288 260 398 300 438 380C478 460 418 540 488 620C528 670 538 720 558 770"
        fill="none"
        stroke="#4d76ee"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M340 -10C290 60 370 120 340 190C310 260 420 300 460 380C500 460 440 540 510 620C550 670 560 720 580 770"
        fill="none"
        stroke="#b3c6ff"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <ellipse cx="392" cy="140" rx="13" ry="22" transform="rotate(-24 392 140)" fill="#4d76ee" />
      <ellipse cx="470" cy="268" rx="9" ry="15" transform="rotate(-18 470 268)" fill="#4d76ee" />
      <ellipse cx="540" cy="500" rx="7" ry="11" fill="#4d76ee" opacity="0.8" />

      {/* Swirls inside the wave */}
      <path
        d="M0 318C70 280 150 340 230 312C290 292 330 332 368 384C330 352 292 330 236 344C156 366 84 316 0 352Z"
        fill="#5b82f0"
        opacity="0.35"
      />
      <path d="M0 560C60 530 110 560 150 548C120 580 70 576 0 600Z" fill="#5b82f0" opacity="0.3" />

      {/* Evening sun */}
      <circle cx="292" cy="372" r="46" fill="#f6c96f" />
      <circle
        cx="292"
        cy="372"
        r="64"
        fill="none"
        stroke="#f6c96f"
        strokeWidth="2"
        opacity="0.35"
      />

      {/* Towers */}
      <g className="login-art-city">
        {TOWERS.map((tower, index) => (
          <g key={tower.x}>
            <rect
              x={tower.x}
              y={tower.y}
              width={tower.w}
              height={760 - tower.y}
              fill={tower.fill}
            />
            {windows(tower, index)}
          </g>
        ))}
        <path d="M128 392L164 340L200 392Z" fill="#f6c96f" />
        <rect x="161" y="312" width="6" height="30" rx="3" fill="#f6c96f" />
        <rect x="0" y="704" width="600" height="56" fill="#0b1230" />
        <path
          d="M0 716H420"
          stroke="#f6c96f"
          strokeWidth="3"
          strokeDasharray="18 14"
          opacity="0.6"
        />
      </g>

      {/* Chat bubbles: an enquiry in, a reply out */}
      <g className="login-art-bubble login-art-bubble-in">
        <rect x="36" y="104" width="214" height="66" rx="20" fill="#f0efec" />
        <path d="M52 166L44 186L74 168Z" fill="#f0efec" />
        <rect x="58" y="124" width="150" height="9" rx="4.5" fill="#a4a8b0" />
        <rect x="58" y="142" width="104" height="9" rx="4.5" fill="#c9ccd2" />
      </g>
      <g className="login-art-bubble login-art-bubble-out">
        <rect x="104" y="198" width="180" height="56" rx="20" fill="#f6c96f" />
        <path d="M268 250L280 268L250 252Z" fill="#f6c96f" />
        <rect x="124" y="216" width="120" height="9" rx="4.5" fill="#0e1430" opacity="0.75" />
        <rect x="124" y="232" width="78" height="9" rx="4.5" fill="#0e1430" opacity="0.45" />
      </g>
    </svg>
  );
}
