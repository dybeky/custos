import { describe, it, expect } from 'vitest'
import { shouldDropEffects } from './frame-budget'

const frames = (n: number, ms: number) => Array<number>(n).fill(ms)

describe('shouldDropEffects', () => {
  it('waits for enough frames', () => {
    expect(shouldDropEffects(frames(10, 16))).toBeNull()
  })

  it('keeps the effects at a steady 60 fps', () => {
    expect(shouldDropEffects(frames(20, 16.7))).toBe(false)
  })

  it('ignores the long first frames while the app mounts behind the intro', () => {
    expect(shouldDropEffects([180, 90, ...frames(14, 16.7)])).toBe(false)
  })

  it('tolerates a couple of hitches', () => {
    expect(shouldDropEffects([16, 16, 60, ...frames(5, 16), 45, ...frames(10, 16)])).toBe(false)
  })

  it('keeps them at 50 fps and drops them at 30 fps', () => {
    expect(shouldDropEffects(frames(20, 20))).toBe(false)
    expect(shouldDropEffects(frames(20, 33.4))).toBe(true)
  })

  it('drops the effects when many frames are slow', () => {
    expect(shouldDropEffects([16, 16, ...[16, 80, 16, 70, 16, 90, 16, 60, 16, 75, 16, 66, 16, 80]])).toBe(true)
  })
})
