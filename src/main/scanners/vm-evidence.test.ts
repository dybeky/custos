import { describe, it, expect } from 'vitest'
import { formatVmEvidence, type VMFinding } from './vm-scanner'

const net = (vmName: string, mac: string): VMFinding => ({ type: 'Network', vmName, detail: `Virtual MAC: ${mac}`, critical: true })

describe('formatVmEvidence', () => {
  it('does not call a PC that only hosts VMs (WSL2, Docker, VMware Workstation) a VM', () => {
    expect(formatVmEvidence([
      net('Hyper-V', '00:15:5D:01:02:03'), // vEthernet (WSL)
      net('Hyper-V', '00:15:5D:0A:0B:0C'), // vEthernet (Default Switch)
      net('VMware', '00:50:56:C0:00:01'), // VMnet1
      net('VMware', '00:50:56:C0:00:08') // VMnet8
    ])).toEqual([])
  })

  it('reports a guest with independent kinds of evidence', () => {
    const out = formatVmEvidence([
      { type: 'Hardware', vmName: 'VMware', detail: 'VMware, Inc.', critical: true },
      net('VMware', '00:0C:29:11:22:33'),
      { type: 'Driver', vmName: 'VMware', detail: 'vmhgfs.sys', critical: true }
    ])
    expect(out[0]).toBe('[VM DETECTED] VMware - 3 indicators found:')
    expect(out).toHaveLength(4)
  })

  it('needs two kinds even when they are not network', () => {
    expect(formatVmEvidence([{ type: 'Environment', vmName: 'Wine', detail: 'Wine environment detected', critical: true }])).toEqual([])
  })
})
