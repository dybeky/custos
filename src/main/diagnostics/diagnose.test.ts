import { describe, it, expect } from 'vitest'
import { diagnoseError, diagnoseLoadFailure, diagnoseProcessGone, gpuVendorFromId, FIX_URLS } from './diagnose'

const dlopen = (message: string) => Object.assign(new Error(message), { code: 'ERR_DLOPEN_FAILED' })

describe('diagnoseError', () => {
  it('recognises a missing Visual C++ runtime by DLL name', () => {
    const d = diagnoseError(new Error('Error loading VCRUNTIME140_1.dll'))
    expect(d.id).toBe('vcredist-missing')
    expect(d.fix?.url).toBe(FIX_URLS.vcredist)
  })

  it('recognises a native addon that cannot find its dependencies', () => {
    const d = diagnoseError(dlopen('The specified module could not be found.\r\n\\\\?\\C:\\app\\memoryjs.node'))
    expect(d.id).toBe('vcredist-missing')
  })

  it('points a mismatched native addon at the releases page', () => {
    const d = diagnoseError(dlopen("The module 'x.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 115"))
    expect(d).toMatchObject({ id: 'native-abi-mismatch', fix: { url: FIX_URLS.releases } })
  })

  it('recognises the wrong CPU architecture', () => {
    expect(diagnoseError(dlopen('\\\\?\\C:\\x\\koffi.node is not a valid Win32 application.')).id).toBe('wrong-architecture')
  })

  it('recognises a full disk and access denied, without offering a download', () => {
    const full = diagnoseError(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }))
    expect(full.id).toBe('disk-full')
    expect(full.fix).toBeUndefined()
    const denied = diagnoseError(Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }))
    expect(denied.id).toBe('access-denied')
    expect(denied.fix).toBeUndefined()
  })

  it('never guesses: an unknown error is reported as unexpected with its message and no link', () => {
    const d = diagnoseError(new TypeError("Cannot read properties of undefined (reading 'x')"))
    expect(d.id).toBe('unexpected')
    expect(d.detail).toContain("Cannot read properties of undefined")
    expect(d.fix).toBeUndefined()
  })

  it('does not blame the VC++ runtime for a plain missing file', () => {
    expect(diagnoseError(Object.assign(new Error("Cannot find module './foo'"), { code: 'MODULE_NOT_FOUND' })).id).toBe('unexpected')
  })

  it('accepts non-Error values', () => {
    expect(diagnoseError('boom').id).toBe('unexpected')
    expect(diagnoseError(undefined).id).toBe('unexpected')
  })
})

describe('diagnoseProcessGone', () => {
  it('diagnoses a GPU crash and links the driver page for a known vendor', () => {
    const d = diagnoseProcessGone({ type: 'GPU', reason: 'crashed', exitCode: -1 }, 'nvidia')
    expect(d).toMatchObject({ id: 'gpu-crash', fix: { url: FIX_URLS.nvidia } })
  })

  it('offers no driver link when the vendor is unknown', () => {
    expect(diagnoseProcessGone({ type: 'GPU', reason: 'crashed' }, null)?.fix).toBeUndefined()
  })

  it('diagnoses renderer out-of-memory and crashes', () => {
    expect(diagnoseProcessGone({ reason: 'oom' })?.id).toBe('out-of-memory')
    expect(diagnoseProcessGone({ reason: 'crashed' })?.id).toBe('renderer-crash')
  })

  it('ignores normal exits and other utility processes', () => {
    expect(diagnoseProcessGone({ reason: 'clean-exit' })).toBeNull()
    expect(diagnoseProcessGone({ reason: 'killed' })).toBeNull()
    expect(diagnoseProcessGone({ type: 'Utility', reason: 'crashed' })).toBeNull()
  })
})

describe('diagnoseLoadFailure', () => {
  it('treats a missing bundled page as a damaged install', () => {
    expect(diagnoseLoadFailure(-6, 'ERR_FILE_NOT_FOUND')).toMatchObject({ id: 'damaged-install', fix: { url: FIX_URLS.releases } })
  })
  it('ignores aborted navigations', () => {
    expect(diagnoseLoadFailure(-3, 'ERR_ABORTED')).toBeNull()
  })
})

describe('gpuVendorFromId', () => {
  it('maps PCI vendor ids', () => {
    expect(gpuVendorFromId(0x10de)).toBe('nvidia')
    expect(gpuVendorFromId(0x1002)).toBe('amd')
    expect(gpuVendorFromId(0x8086)).toBe('intel')
    expect(gpuVendorFromId(0x1234)).toBeNull()
    expect(gpuVendorFromId(undefined)).toBeNull()
  })
})
