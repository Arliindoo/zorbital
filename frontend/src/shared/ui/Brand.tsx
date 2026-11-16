/** Uma forma por letra, na ordem de leitura: a entrada anima cada uma em separado. */
const LETTERS = [
  'M0 69.72L54.48 16.8H0.72V0H84.84V16.2L30.48 69.6H84.96V86.4H0V69.72Z',
  'M169.337 86.4H116.417C102.617 86.4 93.2569 77.76 93.2569 63.6V22.68C93.2569 8.64 102.617 0 116.417 0H169.337C182.897 0 192.257 8.64 192.257 22.68V63.6C192.257 77.76 182.897 86.4 169.337 86.4ZM171.857 56.28V30.12C171.857 21.6 167.657 17.4 159.137 17.4H126.737C117.977 17.4 113.657 21.6 113.657 30.12V56.28C113.657 64.8 117.977 69 126.737 69H159.137C167.657 69 171.857 64.8 171.857 56.28Z',
  'M277.01 28.92V28.44C277.01 20.64 273.05 16.8 265.25 16.8H224.45V40.8H265.13C273.05 40.8 277.01 36.84 277.01 28.92ZM224.45 86.4H204.05V0H273.17C289.49 0 297.65 8.52 297.65 25.44V34.2C297.65 48.48 291.65 57.36 278.21 57.36H275.21L298.85 86.4H274.37L250.61 57.6H224.45V86.4Z',
  'M328.306 49.8V70.44H369.346C377.266 70.44 381.226 67.08 381.226 60.24V59.76C381.226 53.16 377.266 49.8 369.466 49.8H328.306ZM328.306 15.96V34.8H368.386C376.306 34.8 380.266 31.68 380.266 25.44V24.96C380.266 18.96 376.306 15.96 368.506 15.96H328.306ZM377.266 86.4H307.906V0H376.426C392.746 0 400.906 7.44 400.906 22.32V23.52C400.906 33.6 396.226 39.48 386.146 40.8C397.066 41.76 401.986 48.72 401.986 60.24V61.56C401.986 78.12 393.706 86.4 377.266 86.4Z',
  'M411.059 86.4V0H431.459V86.4H411.059Z',
  'M475.094 86.4V16.8H440.174V0H530.414V16.8H495.494V86.4H475.094Z',
  'M574.855 17.28L559.495 49.92H590.095L574.855 17.28ZM629.575 86.4H606.295L597.175 66.72H552.175L543.175 86.4H519.895L563.215 0H586.255L629.575 86.4Z',
  'M638.604 0H659.004V69.96H721.524V86.4H638.604V0Z',
]

/**
 * Nome da marca desenhado. Sem `label` é decorativo (quem o envolve já diz o nome).
 * `room` abre folga dos dois lados (em unidades do desenho) para as letras se afastarem
 * durante a abertura sem serem cortadas.
 */
export function Wordmark({ className = '', label, room = 0 }: { className?: string; label?: string; room?: number }) {
  return (
    <svg
      className={`wordmark ${className}`}
      viewBox={`${-room} 0 ${722 + 2 * room} 87`}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {LETTERS.map((d) => (
        // o grupo leva o afastamento lateral; a letra, a subida
        <g key={d}>
          <path d={d} />
        </g>
      ))}
    </svg>
  )
}

/** Caminho da órbita: uma elipse inclinada, percorrida a partir do ponto mais distante. */
const ORBIT = 'M3 16a13 5.6 0 1 0 26 0a13 5.6 0 1 0-26 0'

/**
 * Órbita viva do topo do trilho recolhido: um núcleo e um corpo que dá voltas em torno dele,
 * deixando um rastro que afina. O rastro são três arcos do mesmo caminho, cada um mais curto e
 * mais forte que o anterior, com a ponta no mesmo lugar; o movimento é só `stroke-dashoffset`.
 */
export function BrandOrbit({ className = '' }: { className?: string }) {
  return (
    <svg className={`orbit ${className}`} viewBox="0 0 32 32" fill="none" aria-hidden>
      <g transform="rotate(-28 16 16)" strokeLinecap="round">
        <path className="orbit__ring" d={ORBIT} />
        <path className="orbit__trail" d={ORBIT} pathLength={1} style={{ '--l': '0.46px', opacity: 0.22 } as React.CSSProperties} />
        <path className="orbit__trail" d={ORBIT} pathLength={1} style={{ '--l': '0.26px', opacity: 0.5 } as React.CSSProperties} />
        <path className="orbit__trail" d={ORBIT} pathLength={1} style={{ '--l': '0.1px' } as React.CSSProperties} />
        <path className="orbit__body" d={ORBIT} pathLength={1} />
      </g>
      <circle className="orbit__core" cx="16" cy="16" r="3.2" />
    </svg>
  )
}
