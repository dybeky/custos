// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Case } from './Case'
import { useScanStore } from '../stores/scan-store'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }))

beforeEach(() => {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = {
    listHistory: vi.fn(async () => []),
    getHistory: vi.fn(async () => null)
  }
  useScanStore.setState({ history: [] })
})

describe('Case page', () => {
  // The router already decodes the :key segment, so a player whose name holds a
  // "%" must not be decoded a second time (that throws and blanks the app).
  it('opens for a player whose name contains a percent sign', () => {
    const key = 'name:100%legit'
    expect(() =>
      render(
        <MemoryRouter initialEntries={[`/case/${encodeURIComponent(key)}`]}>
          <Routes>
            <Route path="/case/:key" element={<Case />} />
          </Routes>
        </MemoryRouter>
      )
    ).not.toThrow()
  })
})
