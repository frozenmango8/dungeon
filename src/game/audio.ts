import type { GameEvent } from './simulation'

export class GameAudio {
  private context: AudioContext | null = null
  private seenEvent = 0
  private voices = 0
  private ambient: { oscillator: OscillatorNode; gain: GainNode } | null = null
  soundEnabled = true
  musicEnabled = false

  unlock() {
    if (!this.context) this.context = new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
    this.updateAmbient()
  }

  setSound(enabled: boolean) {
    this.soundEnabled = enabled
  }

  setMusic(enabled: boolean) {
    this.musicEnabled = enabled
    this.unlock()
    this.updateAmbient()
  }

  private updateAmbient() {
    if (!this.context) return
    if (this.musicEnabled && !this.ambient) {
      const oscillator = this.context.createOscillator()
      const gain = this.context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = 73
      gain.gain.value = 0.018
      oscillator.connect(gain).connect(this.context.destination)
      oscillator.start()
      this.ambient = { oscillator, gain }
    } else if (!this.musicEnabled && this.ambient) {
      this.ambient.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08)
      this.ambient.oscillator.stop(this.context.currentTime + 0.3)
      this.ambient = null
    }
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
    if (!this.context || !this.soundEnabled || this.voices >= 7) return
    const now = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency * (0.96 + Math.random() * 0.08), now)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
    this.voices += 1
    oscillator.addEventListener('ended', () => {
      this.voices = Math.max(0, this.voices - 1)
    })
  }

  consume(events: GameEvent[]) {
    for (const event of events) {
      if (event.id <= this.seenEvent) continue
      this.seenEvent = event.id
      if (!this.soundEnabled || !this.context) continue
      if (event.type === 'smelt') this.tone(104, 0.22, 0.035, 'sine')
      if (event.type === 'forge') {
        this.tone(180, 0.1, 0.07, 'square')
        this.tone(580, 0.16, 0.025, 'sine', 0.045)
      }
      if (event.type === 'equip') {
        this.tone(540, 0.12, 0.04, 'sine')
        this.tone(810, 0.18, 0.035, 'sine', 0.08)
      }
      if (event.type === 'hit') this.tone(event.text === 'CRIT' ? 120 : 155, 0.08, 0.045, 'square')
      if (event.type === 'heroHit') this.tone(95, 0.1, 0.035, 'sawtooth')
      if (event.type === 'coinArrive') {
        this.tone(660, 0.08, 0.03, 'sine')
        this.tone(890, 0.08, 0.025, 'sine', 0.05)
      }
      if (event.type === 'place') this.tone(110, 0.12, 0.035, 'triangle')
      if (event.type === 'upgrade' || event.type === 'objective') {
        this.tone(392, 0.22, 0.04, 'triangle')
        this.tone(523, 0.25, 0.04, 'triangle', 0.09)
        this.tone(659, 0.32, 0.04, 'triangle', 0.18)
      }
      if (event.type === 'boss') {
        this.tone(196, 0.34, 0.045, 'triangle')
        this.tone(294, 0.4, 0.04, 'triangle', 0.1)
        this.tone(392, 0.48, 0.04, 'triangle', 0.2)
      }
    }
  }
}
