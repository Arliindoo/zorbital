// Liberação da entrada. A abertura (components/Intro.tsx) libera quando a cortina já descobre
// o painel, ou logo de cara quando não toca; as animações de entrada das páginas só começam
// depois disso, para não acontecerem escondidas atrás dela.
let release!: () => void

export const introReleased = new Promise<void>((resolve) => {
  release = resolve
})

export const releaseIntro = () => release()
