import { describe, it, expect } from 'vitest'
import { envelopeAt, musicVolume, stepToggleFade, MUSIC_VOLUME, FADE_IN_S, FADE_OUT_S, TOGGLE_FADE_S } from './intro-music'

describe('envelopeAt', () => {
  const D = 100

  it('starts silent, rises smoothly and is full after the fade in', () => {
    expect(envelopeAt(0, D)).toBe(0)
    expect(envelopeAt(FADE_IN_S / 2, D)).toBeCloseTo(0.5, 5)
    expect(envelopeAt(FADE_IN_S, D)).toBe(1)
    expect(envelopeAt(50, D)).toBe(1)
  })

  it('never jumps: it only rises during the fade in and only falls during the fade out', () => {
    let prev = 0
    for (let t = 0; t <= FADE_IN_S; t += 0.05) {
      const v = envelopeAt(t, D)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v - prev).toBeLessThan(0.05)
      prev = v
    }
    prev = 1
    for (let t = D - FADE_OUT_S; t <= D; t += 0.05) {
      const v = envelopeAt(t, D)
      expect(v).toBeLessThanOrEqual(prev)
      expect(prev - v).toBeLessThan(0.05)
      prev = v
    }
  })

  it('ends silent', () => {
    expect(envelopeAt(D, D)).toBe(0)
    expect(envelopeAt(D + 5, D)).toBe(0)
  })

  it('uses shorter fades for a very short track instead of jumping', () => {
    for (let t = 0; t <= 4; t += 0.1) expect(envelopeAt(t, 4)).toBeLessThanOrEqual(1)
    expect(envelopeAt(2, 4)).toBe(1)
    expect(envelopeAt(0, 4)).toBe(0)
  })

  it('is silent when the duration is not known yet', () => {
    expect(envelopeAt(1, NaN)).toBe(0)
    expect(envelopeAt(1, 0)).toBe(0)
    expect(envelopeAt(1, Infinity)).toBe(0)
  })
})

describe('stepToggleFade', () => {
  it('fades out and back in over the toggle time, without overshooting', () => {
    expect(stepToggleFade(1, 0, TOGGLE_FADE_S / 2)).toBeCloseTo(0.5, 5)
    expect(stepToggleFade(0.1, 0, 5)).toBe(0)
    expect(stepToggleFade(0, 1, TOGGLE_FADE_S / 4)).toBeCloseTo(0.25, 5)
    expect(stepToggleFade(0.9, 1, 5)).toBe(1)
    expect(stepToggleFade(0.4, 0.4, 1)).toBe(0.4)
  })
})

describe('musicVolume', () => {
  it('is 10% at the loudest and zero at the edges or when switched off', () => {
    expect(musicVolume(50, 100, 1)).toBeCloseTo(MUSIC_VOLUME, 5)
    expect(MUSIC_VOLUME).toBe(0.1)
    expect(musicVolume(0, 100, 1)).toBe(0)
    expect(musicVolume(100, 100, 1)).toBe(0)
    expect(musicVolume(50, 100, 0)).toBe(0)
  })

  it('stays inside 0–1 for any input', () => {
    for (const [p, d, f] of [[-5, 100, 1], [500, 100, 2], [50, 100, -1], [10, NaN, 1]] as const) {
      const v = musicVolume(p, d, f)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
