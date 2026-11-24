import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

/**
 * Ambient occlusion for the daylight preset: darkens creases and gaps where sky light cannot
 * reach. The composer takes over tone mapping, so Neutral is applied here as the final pass.
 * Loaded on demand so other presets never download the postprocessing bundle.
 */
export default function DaylightEffects({ halfResolution }: { halfResolution: boolean }) {
  return (
    <EffectComposer multisampling={4}>
      {/* World units: the preview model is always fitted to 1.8 units across. */}
      <N8AO aoRadius={0.25} distanceFalloff={1} intensity={2.5} quality="medium" halfRes={halfResolution} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}
