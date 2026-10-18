// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReportProblem } from './ReportProblem'
import { useScanStore } from '../stores/scan-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))

const send = vi.fn()
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ReportProblem />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue({ ok: true })
  ;(window as any).electronAPI = { sendProblemReport: send }
  useScanStore.getState().reset()
})

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('problem.whatPlaceholder'), { target: { value: 'Registry scanner hangs' } })
  fireEvent.change(screen.getByPlaceholderText('problem.detailsPlaceholder'), { target: { value: 'It stays on 40% for minutes.' } })
}

describe('ReportProblem', () => {
  it('keeps Send off until the title and details are long enough', () => {
    renderAt('/')
    fireEvent.click(screen.getByText('problem.button'))
    const submit = screen.getByText('problem.send').closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fill()
    expect(submit.disabled).toBe(false)
  })

  it('sends an app problem from the dashboard without scanner names, then thanks the person', async () => {
    renderAt('/')
    fireEvent.click(screen.getByText('problem.button'))
    fill()
    fireEvent.click(screen.getByText('problem.send'))
    await waitFor(() => expect(send).toHaveBeenCalled())
    const payload = send.mock.calls[0][0]
    expect(payload).toMatchObject({ kind: 'app', title: 'Registry scanner hangs', page: 'dashboard' })
    expect(payload.failedScanners).toBeUndefined()
    expect(await screen.findByText('problem.sentTitle')).toBeTruthy()
  })

  it('opened on the scan page it starts as a scanner problem and names the failed scanners', async () => {
    useScanStore.setState({
      results: [
        { scannerName: 'Registry Scanner', success: false, findings: ['secret finding'], startTime: new Date(), endTime: new Date(), duration: 1, count: 1, hasFindings: true },
        { scannerName: 'Prefetch Scanner', success: true, findings: [], startTime: new Date(), endTime: new Date(), duration: 1, count: 0, hasFindings: false }
      ]
    } as never)
    renderAt('/scan')
    fireEvent.click(screen.getByText('problem.button'))
    expect(screen.getByRole('radio', { checked: true }).textContent).toBe('problem.kind.scanner')
    fill()
    fireEvent.click(screen.getByText('problem.send'))
    await waitFor(() => expect(send).toHaveBeenCalled())
    const payload = send.mock.calls[0][0]
    expect(payload).toMatchObject({ kind: 'scanner', page: 'scan', failedScanners: ['Registry Scanner'], scanners: ['Prefetch Scanner'] })
    expect(JSON.stringify(payload)).not.toContain('secret finding')
  })

  it('shows the error and keeps the text when sending fails', async () => {
    send.mockResolvedValue({ ok: false, error: 'rate_limited' })
    renderAt('/')
    fireEvent.click(screen.getByText('problem.button'))
    fill()
    fireEvent.click(screen.getByText('problem.send'))
    expect((await screen.findByRole('alert')).textContent).toBe('problem.errors.rate_limited')
    expect((screen.getByPlaceholderText('problem.whatPlaceholder') as HTMLInputElement).value).toBe('Registry scanner hangs')
  })
})
