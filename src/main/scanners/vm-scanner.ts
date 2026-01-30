import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { existsSync } from 'fs'

// VM Guest Tools processes (only run INSIDE VM)
const VM_GUEST_PROCESSES: Record<string, string[]> = {
  VMware: ['vmtoolsd.exe', 'vmwaretray.exe', 'vmacthlp.exe'],
  VirtualBox: ['VBoxService.exe', 'VBoxTray.exe', 'VBoxClient.exe'],
  'QEMU/KVM': ['qemu-ga.exe'],
  Parallels: ['prl_tools_service.exe', 'prl_cc.exe', 'prl_tools.exe'],
  Sandboxie: ['SbieSvc.exe', 'SbieCtrl.exe', 'SandboxieDcomLaunch.exe'],
  Wine: ['winedevice.exe']
}

// VM Guest drivers (only present INSIDE VM)
const VM_GUEST_DRIVERS: Record<string, string[]> = {
  VMware: [
    'C:\\Windows\\System32\\drivers\\vmci.sys',
    'C:\\Windows\\System32\\drivers\\vmmouse.sys',
    'C:\\Windows\\System32\\drivers\\vmhgfs.sys',
    'C:\\Windows\\System32\\drivers\\vmusbmouse.sys',
    'C:\\Windows\\System32\\drivers\\vmx_svga.sys',
    'C:\\Windows\\System32\\drivers\\vmxnet.sys'
  ],
  VirtualBox: [
    'C:\\Windows\\System32\\drivers\\VBoxGuest.sys',
    'C:\\Windows\\System32\\drivers\\VBoxMouse.sys',
    'C:\\Windows\\System32\\drivers\\VBoxSF.sys',
    'C:\\Windows\\System32\\drivers\\VBoxVideo.sys',
    'C:\\Windows\\System32\\VBoxControl.exe',
    'C:\\Windows\\System32\\VBoxTray.exe'
  ],
  'Hyper-V': [
    'C:\\Windows\\System32\\drivers\\vmbus.sys',
    'C:\\Windows\\System32\\drivers\\VMBusHID.sys',
    'C:\\Windows\\System32\\drivers\\storvsc.sys'
  ],
  'QEMU/KVM': [
    'C:\\Windows\\System32\\drivers\\vioscsi.sys',
    'C:\\Windows\\System32\\drivers\\viostor.sys',
    'C:\\Windows\\System32\\drivers\\vioinput.sys',
    'C:\\Windows\\System32\\drivers\\vioser.sys',
    'C:\\Windows\\System32\\drivers\\balloon.sys'
  ],
  Parallels: [
    'C:\\Windows\\System32\\drivers\\prl_fs.sys',
    'C:\\Windows\\System32\\drivers\\prl_pv32.sys',
    'C:\\Windows\\System32\\drivers\\prl_boot.sys'
  ],
  Xen: [
    'C:\\Windows\\System32\\drivers\\xenbus.sys',
    'C:\\Windows\\System32\\drivers\\xenvbd.sys',
    'C:\\Windows\\System32\\drivers\\xenvif.sys'
  ],
  Sandboxie: [
    'C:\\Windows\\System32\\drivers\\SbieDrv.sys'
  ]
}

// VM Guest registry keys (only present INSIDE VM)
const VM_GUEST_REGISTRY: Record<string, string[]> = {
  VMware: [
    'HKLM\\SOFTWARE\\VMware, Inc.\\VMware Tools',
    'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VMTools'
  ],
  VirtualBox: [
    'HKLM\\SOFTWARE\\Oracle\\VirtualBox Guest Additions',
    'HKLM\\HARDWARE\\ACPI\\DSDT\\VBOX__',
    'HKLM\\HARDWARE\\ACPI\\FADT\\VBOX__',
    'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBoxGuest'
  ],
  'Hyper-V': [
    'HKLM\\SOFTWARE\\Microsoft\\Virtual Machine\\Guest\\Parameters'
  ],
  Sandboxie: [
    'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SbieDrv'
  ]
}

// VM Guest services (only run INSIDE VM)
const VM_GUEST_SERVICES: Record<string, string[]> = {
  VMware: ['VMTools'],
  VirtualBox: ['VBoxService', 'VBoxGuest'],
  'Hyper-V': ['vmicheartbeat', 'vmicvss', 'vmicshutdown'],
  'QEMU/KVM': ['QEMU-GA', 'qemu-guest-agent'],
  Parallels: ['prl_tools_service'],
  Sandboxie: ['SbieSvc'],
  'Windows Sandbox': ['CExecSvc']
}

// VM-specific MAC address prefixes
const VM_MAC_PREFIXES: Record<string, string[]> = {
  VMware: ['00:0C:29', '00:50:56', '00:05:69', '00-0C-29', '00-50-56', '00-05-69'],
  VirtualBox: ['08:00:27', '0A:00:27', '08-00-27', '0A-00-27'],
  'Hyper-V': ['00:15:5D', '00-15-5D'],
  'QEMU/KVM': ['52:54:00', '52-54-00'],
  Parallels: ['00:1C:42', '00-1C-42'],
  Xen: ['00:16:3E', '00-16-3E']
}

// PCI Vendor IDs for hardware detection (only visible INSIDE VM)
const VM_PCI_VENDORS: Record<string, string[]> = {
  VMware: ['VEN_15AD'],
  VirtualBox: ['VEN_80EE'],
  'Hyper-V': ['VEN_1414'],
  'QEMU/KVM': ['VEN_1AF4', 'VEN_1B36']
}

// WMI indicators (most reliable - hardware level)
const WMI_VM_INDICATORS: Record<string, string[]> = {
  VMware: ['VMware'],
  VirtualBox: ['VirtualBox', 'VBOX'],
  'Hyper-V': ['Virtual Machine', 'Microsoft Virtual'],
  'QEMU/KVM': ['QEMU', 'KVM', 'Standard PC'],
  Parallels: ['Parallels'],
  Xen: ['Xen', 'HVM domU']
}

interface VMFinding {
  type: string
  vmName: string
  detail: string
  critical: boolean // true = running inside VM, false = VM software on host
}

export class VMScanner extends BaseScanner {
  readonly name = 'VM Scanner'
  readonly description = 'Detection of virtual machines and sandbox environments'

  private static readonly EXEC_TIMEOUT = 15000
  private static readonly BUFFER_SIZE = 10 * 1024 * 1024

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const allFindings: VMFinding[] = []
      const checkMethods = [
        { name: 'WMI Hardware', fn: () => this.checkWMI() },
        { name: 'MAC Addresses', fn: () => this.checkMacAddresses() },
        { name: 'Guest Drivers', fn: () => this.checkGuestDrivers() },
        { name: 'Guest Processes', fn: () => this.checkGuestProcesses() },
        { name: 'Guest Services', fn: () => this.checkGuestServices() },
        { name: 'Guest Registry', fn: () => this.checkGuestRegistry() },
        { name: 'Hardware IDs', fn: () => this.checkHardware() },
        { name: 'Environment', fn: () => this.checkEnvironment() }
      ]

      for (let i = 0; i < checkMethods.length; i++) {
        if (this.cancelled) break

        const method = checkMethods[i]

        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: i + 1,
            totalItems: checkMethods.length,
            currentPath: `Checking ${method.name}...`,
            percentage: ((i + 1) / checkMethods.length) * 100
          })
        }

        try {
          const findings = await method.fn()
          allFindings.push(...findings)
        } catch {
          // Continue with other checks on error
        }
      }

      // Only report if we have CRITICAL findings (actually running in VM)
      const criticalFindings = allFindings.filter(f => f.critical)

      if (criticalFindings.length === 0) {
        // No VM detected
        return this.createSuccessResult([], startTime)
      }

      // Group by VM type and count evidence
      const vmEvidence = new Map<string, { count: number; details: string[] }>()
      for (const finding of criticalFindings) {
        const existing = vmEvidence.get(finding.vmName) || { count: 0, details: [] }
        existing.count++
        existing.details.push(`${finding.type}: ${finding.detail}`)
        vmEvidence.set(finding.vmName, existing)
      }

      // Only report VMs with strong evidence (2+ indicators)
      const formattedFindings: string[] = []
      for (const [vmName, evidence] of vmEvidence) {
        if (evidence.count >= 2) {
          formattedFindings.push(`[VM DETECTED] ${vmName} - ${evidence.count} indicators found:`)
          for (const detail of evidence.details) {
            formattedFindings.push(`  • ${detail}`)
          }
        }
      }

      return this.createSuccessResult(formattedFindings, startTime)
    } catch (error) {
      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      )
    }
  }

  private async checkWMI(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []
    const detectedVMs = new Set<string>()

    // Check computer system manufacturer and model - MOST RELIABLE
    try {
      const csOutput = await asyncExec(
        'wmic computersystem get Manufacturer,Model /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      for (const [vmName, indicators] of Object.entries(WMI_VM_INDICATORS)) {
        for (const indicator of indicators) {
          if (csOutput.toLowerCase().includes(indicator.toLowerCase()) && !detectedVMs.has(vmName)) {
            const manufacturerMatch = csOutput.match(/Manufacturer=(.+)/i)
            const modelMatch = csOutput.match(/Model=(.+)/i)
            const value = manufacturerMatch?.[1]?.trim() || modelMatch?.[1]?.trim() || indicator

            findings.push({
              type: 'Hardware',
              vmName,
              detail: value,
              critical: true
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // WMI check failed
    }

    // Check BIOS
    try {
      const biosOutput = await asyncExec(
        'wmic bios get Manufacturer,SerialNumber /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      for (const [vmName, indicators] of Object.entries(WMI_VM_INDICATORS)) {
        if (detectedVMs.has(vmName)) continue
        for (const indicator of indicators) {
          if (biosOutput.toLowerCase().includes(indicator.toLowerCase())) {
            findings.push({
              type: 'BIOS',
              vmName,
              detail: `VM BIOS detected`,
              critical: true
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // BIOS check failed
    }

    // Check disk drive model
    try {
      const diskOutput = await asyncExec(
        'wmic diskdrive get Model /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      for (const [vmName, indicators] of Object.entries(WMI_VM_INDICATORS)) {
        if (detectedVMs.has(vmName)) continue
        for (const indicator of indicators) {
          if (diskOutput.toLowerCase().includes(indicator.toLowerCase())) {
            findings.push({
              type: 'Disk',
              vmName,
              detail: `Virtual disk detected`,
              critical: true
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // Disk check failed
    }

    return findings
  }

  private async checkMacAddresses(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      let output = await asyncExec(
        'getmac /FO CSV /NH 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      if (!output.trim()) {
        output = await asyncExec(
          'wmic nic get MACAddress /FORMAT:CSV 2>nul',
          { timeout: VMScanner.EXEC_TIMEOUT }
        )
      }

      const macAddresses = this.extractMacAddresses(output)

      for (const mac of macAddresses) {
        const normalizedMac = mac.toUpperCase()

        for (const [vmName, prefixes] of Object.entries(VM_MAC_PREFIXES)) {
          for (const prefix of prefixes) {
            if (normalizedMac.startsWith(prefix.toUpperCase())) {
              findings.push({
                type: 'Network',
                vmName,
                detail: `Virtual MAC: ${mac}`,
                critical: true
              })
              break
            }
          }
        }
      }
    } catch {
      // MAC check failed
    }

    return findings
  }

  private extractMacAddresses(output: string): string[] {
    const macs: string[] = []
    const macRegex = /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g
    const matches = output.match(macRegex)
    if (matches) {
      macs.push(...matches)
    }
    return [...new Set(macs)]
  }

  private async checkGuestProcesses(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      const output = await asyncExec(
        'tasklist /FO CSV /NH 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const runningProcesses = new Set<string>()
      const lines = output.split('\n')
      for (const line of lines) {
        const match = line.match(/"([^"]+)"/)
        if (match) {
          runningProcesses.add(match[1].toLowerCase())
        }
      }

      for (const [vmName, processes] of Object.entries(VM_GUEST_PROCESSES)) {
        for (const proc of processes) {
          if (runningProcesses.has(proc.toLowerCase())) {
            findings.push({
              type: 'Process',
              vmName,
              detail: `Guest tools: ${proc}`,
              critical: true
            })
          }
        }
      }
    } catch {
      // Process check failed
    }

    return findings
  }

  private async checkGuestServices(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      const output = await asyncExec(
        'sc query state= all 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const runningServices = new Set<string>()
      const blocks = output.split(/SERVICE_NAME:/)
      for (const block of blocks) {
        const lines = block.split('\n')
        const serviceName = lines[0]?.trim().toLowerCase()
        if (serviceName && block.includes('RUNNING')) {
          runningServices.add(serviceName)
        }
      }

      for (const [vmName, services] of Object.entries(VM_GUEST_SERVICES)) {
        for (const service of services) {
          if (runningServices.has(service.toLowerCase())) {
            findings.push({
              type: 'Service',
              vmName,
              detail: `Guest service: ${service}`,
              critical: true
            })
          }
        }
      }
    } catch {
      // Service check failed
    }

    return findings
  }

  private async checkGuestDrivers(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    for (const [vmName, drivers] of Object.entries(VM_GUEST_DRIVERS)) {
      if (this.cancelled) break

      for (const driverPath of drivers) {
        try {
          if (existsSync(driverPath)) {
            findings.push({
              type: 'Driver',
              vmName,
              detail: `Guest driver: ${driverPath.split('\\').pop()}`,
              critical: true
            })
            break // One driver is enough
          }
        } catch {
          // File check failed
        }
      }
    }

    return findings
  }

  private async checkGuestRegistry(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    for (const [vmName, keys] of Object.entries(VM_GUEST_REGISTRY)) {
      if (this.cancelled) break

      for (const keyPath of keys) {
        try {
          const output = await asyncExec(
            `reg query "${keyPath}" 2>nul`,
            { timeout: VMScanner.EXEC_TIMEOUT }
          )

          if (output && output.trim()) {
            findings.push({
              type: 'Registry',
              vmName,
              detail: `Guest additions installed`,
              critical: true
            })
            break
          }
        } catch {
          // Key not found
        }
      }
    }

    return findings
  }

  private async checkHardware(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      const output = await asyncExec(
        'wmic path Win32_PnPEntity get DeviceID /FORMAT:CSV 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const outputUpper = output.toUpperCase()

      for (const [vmName, vendorIds] of Object.entries(VM_PCI_VENDORS)) {
        for (const vendorId of vendorIds) {
          if (outputUpper.includes(vendorId)) {
            findings.push({
              type: 'PCI',
              vmName,
              detail: `Virtual hardware: ${vendorId}`,
              critical: true
            })
            break
          }
        }
      }
    } catch {
      // Hardware check failed
    }

    return findings
  }

  private async checkEnvironment(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    // Windows Sandbox detection
    if (process.env.COMPUTERNAME?.toLowerCase().includes('wdagutility')) {
      findings.push({
        type: 'Environment',
        vmName: 'Windows Sandbox',
        detail: 'Windows Sandbox detected',
        critical: true
      })
    }

    // Wine detection
    if (process.env['WINEPREFIX'] || process.env['WINEDIR']) {
      findings.push({
        type: 'Environment',
        vmName: 'Wine',
        detail: 'Wine environment detected',
        critical: true
      })
    }

    return findings
  }
}
