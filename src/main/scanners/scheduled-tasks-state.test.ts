import { describe, it, expect } from 'vitest'
import { taskState } from './scheduled-tasks-scanner'

describe('taskState', () => {
  it.each([
    ['Ready', 'Ready'],
    ['Bereit', 'Ready'],
    ['Готово', 'Ready'],
    ['Wird ausgeführt', 'Running'],
    ['Выполняется', 'Running'],
    ['Deaktiviert', 'Disabled'],
    ['Отключено', 'Disabled']
  ])('%s -> %s', (raw, state) => {
    expect(taskState(raw)).toBe(state)
  })

  it('leaves out a state in a language it does not know', () => {
    expect(taskState('準備完了')).toBe('')
    expect(taskState('')).toBe('')
  })
})
