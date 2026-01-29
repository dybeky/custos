import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { existsSync } from 'fs'

// VM-specific MAC address prefixes
const VM_MAC_PREFIXES: Record<string, string[]> = {
  VMware: ['00:0C:29', '00:50:56', '00:05:69', '00-0C-29', '00-50-56', '00-05-69'],
  VirtualBox: ['08:00:27', '0A:00:27', '08-00-27', '0A-00-27'],
  'Hyper-V': ['00:15:5D', '00-15-5D'],
  'QEMU/KVM': ['52:54:00', '52-54-00'],
  Parallels: ['00:1C:42', '00-1C-42'],
  Xen: ['00:16:3E', '00-16-3E']
}

// VM-specific processes
const VM_PROCESSES: Record<string, string[]> = {
  VMware: ['vmtoolsd.exe', 'vmwaretray.exe', 'vmacthlp.exe', 'vmware.exe', 'vmware-vmx.exe'],
  VirtualBox: ['VBoxService.exe', 'VBoxTray.exe', 'VBoxClient.exe'],
  'Hyper-V': ['vmms.exe', 'vmwp.exe', 'vmcompute.exe'],
  'QEMU/KVM': ['qemu-ga.exe', 'qemu.exe', 'qemu-system-x86_64.exe'],
  Parallels: ['prl_tools_service.exe', 'prl_cc.exe', 'prl_tools.exe'],
  Sandboxie: ['SbieSvc.exe', 'SbieCtrl.exe', 'SandboxieDcomLaunch.exe'],
  Wine: ['wine.exe', 'wineserver.exe', 'wine64.exe', 'winedevice.exe']
}

// VM-specific services
const VM_SERVICES: Record<string, string[]> = {
  VMware: ['VMTools', 'vmci', 'vmhgfs', 'vmvss', 'vmware-vmx'],
  VirtualBox: ['VBoxService', 'VBoxGuest', 'VBoxMouse', 'VBoxSF', 'VBoxVideo'],
  'Hyper-V': ['vmicheartbeat', 'vmicvss', 'vmicshutdown', 'vmicexchange', 'vmms', 'vmcompute'],
  'QEMU/KVM': ['QEMU-GA', 'qemu-guest-agent'],
  Parallels: ['prl_tools_service', 'prltoolsd'],
  Sandboxie: ['SbieSvc', 'SandboxieRpc'],
  'Windows Sandbox': ['CExecSvc']
}

// VM-specific driver files
const VM_FILES: Record<string, string[]> = {
  VMware: [
    'C:\\Windows\\System32\\drivers\\vmci.sys',
    'C:\\Windows\\System32\\drivers\\vmmouse.sys',
    'C:\\Windows\\System32\\drivers\\vmhgfs.sys',
    'C:\\Windows\\System32\\drivers\\vmusbmouse.sys',
    'C:\\Windows\\System32\\drivers\\vmx_svga.sys',
    'C:\\Windows\\System32\\drivers\\vmxnet.sys',
    'C:\\Program Files\\VMware\\VMware Tools\\vmtoolsd.exe'
  ],
  VirtualBox: [
    'C:\\Windows\\System32\\drivers\\VBoxGuest.sys',
    'C:\\Windows\\System32\\drivers\\VBoxMouse.sys',
    'C:\\Windows\\System32\\drivers\\VBoxSF.sys',
    'C:\\Windows\\System32\\drivers\\VBoxVideo.sys',
    'C:\\Windows\\System32\\VBoxControl.exe',
    'C:\\Windows\\System32\\VBoxTray.exe',
    'C:\\Program Files\\Oracle\\VirtualBox Guest Additions\\VBoxTray.exe'
  ],
  'Hyper-V': [
    'C:\\Windows\\System32\\drivers\\vmbus.sys',
    'C:\\Windows\\System32\\drivers\\VMBusHID.sys',
    'C:\\Windows\\System32\\drivers\\storvsc.sys',
    'C:\\Windows\\System32\\drivers\\netvsc.sys'
  ],
  'QEMU/KVM': [
    'C:\\Windows\\System32\\drivers\\vioscsi.sys',
    'C:\\Windows\\System32\\drivers\\viostor.sys',
    'C:\\Windows\\System32\\drivers\\vioinput.sys',
    'C:\\Windows\\System32\\drivers\\vioser.sys',
    'C:\\Windows\\System32\\drivers\\balloon.sys',
    'C:\\Program Files\\Qemu-ga\\qemu-ga.exe'
  ],
  Parallels: [
    'C:\\Windows\\System32\\drivers\\prl_fs.sys',
    'C:\\Windows\\System32\\drivers\\prl_pv32.sys',
    'C:\\Windows\\System32\\drivers\\prl_boot.sys',
    'C:\\Windows\\System32\\drivers\\prl_dd.sys'
  ],
  Xen: [
    'C:\\Windows\\System32\\drivers\\xenbus.sys',
    'C:\\Windows\\System32\\drivers\\xenvbd.sys',
    'C:\\Windows\\System32\\drivers\\xenvif.sys'
  ],
  Sandboxie: [
    'C:\\Windows\\System32\\drivers\\SbieDrv.sys',
    'C:\\Program Files\\Sandboxie\\SbieSvc.exe',
    'C:\\Program Files\\Sandboxie-Plus\\SbieSvc.exe'
  ]
}

// VM-specific registry keys
const VM_REGISTRY_KEYS: Record<string, { path: string; name?: string }[]> = {
  VMware: [
    { path: 'HKLM\\SOFTWARE\\VMware, Inc.\\VMware Tools' },
    { path: 'HKLM\\SOFTWARE\\VMware, Inc.\\VMware VGAuth' },
    { path: 'HKLM\\HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0', name: 'Identifier' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VMTools' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\vmci' }
  ],
  VirtualBox: [
    { path: 'HKLM\\SOFTWARE\\Oracle\\VirtualBox Guest Additions' },
    { path: 'HKLM\\HARDWARE\\ACPI\\DSDT\\VBOX__' },
    { path: 'HKLM\\HARDWARE\\ACPI\\FADT\\VBOX__' },
    { path: 'HKLM\\HARDWARE\\ACPI\\RSDT\\VBOX__' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBoxGuest' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBoxMouse' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBoxService' }
  ],
  'Hyper-V': [
    { path: 'HKLM\\SOFTWARE\\Microsoft\\Virtual Machine\\Guest\\Parameters' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\vmbus' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\VMBusHID' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\storvsc' }
  ],
  'QEMU/KVM': [
    { path: 'HKLM\\HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0', name: 'Identifier' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\vioscsi' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\viostor' }
  ],
  Parallels: [
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\prl_fs' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\prl_pv32' }
  ],
  Xen: [
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\xenbus' },
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\xenvbd' }
  ],
  Sandboxie: [
    { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SbieDrv' },
    { path: 'HKLM\\SOFTWARE\\Sandboxie' },
    { path: 'HKLM\\SOFTWARE\\Sandboxie-Plus' }
  ]
}

// PCI Vendor IDs for hardware detection
const VM_PCI_VENDORS: Record<string, string[]> = {
  VMware: ['VEN_15AD'],
  VirtualBox: ['VEN_80EE'],
  'Hyper-V': ['VEN_1414'],
  'QEMU/KVM': ['VEN_1AF4', 'VEN_1B36']
}

// Environment variables indicating VM
const VM_ENV_VARS: Record<string, string[]> = {
  Wine: ['WINEPREFIX', 'WINEDIR', 'WINELOADER'],
  VirtualBox: ['VBOX_HWVIRTEX_IGNORE_SVM_IN_USE'],
  VMware: ['VMWARE_USE_SHIPPED_GTK']
}

// WMI indicators
const WMI_VM_INDICATORS: Record<string, string[]> = {
  VMware: ['VMware', 'vmware'],
  VirtualBox: ['VirtualBox', 'VBOX'],
  'Hyper-V': ['Microsoft Corporation', 'Virtual Machine'],
  'QEMU/KVM': ['QEMU', 'KVM', 'Standard PC'],
  Parallels: ['Parallels'],
  Xen: ['Xen']
}

interface VMFinding {
  type: string
  vmName: string
  detail: string
}

export class VMScanner extends BaseScanner {
  readonly name = 'VM Scanner'
  readonly description = 'Detection of virtual machines and sandbox environments'

  private static readonly EXEC_TIMEOUT = 15000 // 15 sec per command
  private static readonly BUFFER_SIZE = 10 * 1024 * 1024 // 10MB

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const allFindings: VMFinding[] = []
      const checkMethods = [
        { name: 'Registry', fn: () => this.checkRegistry() },
        { name: 'MAC Addresses', fn: () => this.checkMacAddresses() },
        { name: 'Processes', fn: () => this.checkProcesses() },
        { name: 'Services', fn: () => this.checkServices() },
        { name: 'Files', fn: () => this.checkFiles() },
        { name: 'WMI', fn: () => this.checkWMI() },
        { name: 'Hardware', fn: () => this.checkHardware() },
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

      // Format findings for output
      const formattedFindings = allFindings.map(f =>
        `[${f.type}] ${f.vmName}: ${f.detail}`
      )

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

  private async checkRegistry(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    for (const [vmName, keys] of Object.entries(VM_REGISTRY_KEYS)) {
      if (this.cancelled) break

      for (const key of keys) {
        try {
          // Use reg query to check for key existence
          const output = await asyncExec(
            `reg query "${key.path}" 2>nul`,
            { timeout: VMScanner.EXEC_TIMEOUT }
          )

          if (output && output.trim()) {
            findings.push({
              type: 'Registry',
              vmName,
              detail: `Key found: ${key.path}`
            })
            break // Found one key for this VM, move to next VM
          }
        } catch {
          // Key not found, continue
        }
      }
    }

    return findings
  }

  private async checkMacAddresses(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      // Try getmac first
      let output = await asyncExec(
        'getmac /FO CSV /NH 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      if (!output.trim()) {
        // Fallback to wmic
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
                type: 'MAC',
                vmName,
                detail: `Virtual adapter detected: ${mac}`
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
    // Match MAC addresses in various formats: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
    const macRegex = /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g
    const matches = output.match(macRegex)
    if (matches) {
      macs.push(...matches)
    }
    return [...new Set(macs)] // Remove duplicates
  }

  private async checkProcesses(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      const output = await asyncExec(
        'tasklist /FO CSV /NH 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const runningProcesses = new Set<string>()
      const pidMap = new Map<string, number>()

      const lines = output.split('\n')
      for (const line of lines) {
        const match = line.match(/"([^"]+)","(\d+)"/)
        if (match) {
          const processName = match[1].toLowerCase()
          runningProcesses.add(processName)
          pidMap.set(processName, parseInt(match[2], 10))
        }
      }

      for (const [vmName, processes] of Object.entries(VM_PROCESSES)) {
        for (const proc of processes) {
          const procLower = proc.toLowerCase()
          if (runningProcesses.has(procLower)) {
            const pid = pidMap.get(procLower) || 0
            findings.push({
              type: 'Process',
              vmName,
              detail: `${proc} running (PID: ${pid})`
            })
          }
        }
      }
    } catch {
      // Process check failed
    }

    return findings
  }

  private async checkServices(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      const output = await asyncExec(
        'sc query state= all 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const services = this.parseServiceOutput(output)

      for (const [vmName, vmServices] of Object.entries(VM_SERVICES)) {
        for (const serviceName of vmServices) {
          const serviceInfo = services.get(serviceName.toLowerCase())
          if (serviceInfo) {
            findings.push({
              type: 'Service',
              vmName,
              detail: `Service "${serviceName}" ${serviceInfo.state}`
            })
          }
        }
      }
    } catch {
      // Service check failed
    }

    return findings
  }

  private parseServiceOutput(output: string): Map<string, { name: string; state: string }> {
    const services = new Map<string, { name: string; state: string }>()

    const blocks = output.split(/SERVICE_NAME:/)
    for (const block of blocks) {
      if (!block.trim()) continue

      const lines = block.split('\n')
      const serviceName = lines[0]?.trim()
      if (!serviceName) continue

      let state = 'UNKNOWN'
      for (const line of lines) {
        const stateMatch = line.match(/STATE\s+:\s+\d+\s+(\w+)/)
        if (stateMatch) {
          state = stateMatch[1]
          break
        }
      }

      services.set(serviceName.toLowerCase(), { name: serviceName, state })
    }

    return services
  }

  private async checkFiles(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    for (const [vmName, files] of Object.entries(VM_FILES)) {
      if (this.cancelled) break

      for (const filePath of files) {
        try {
          if (existsSync(filePath)) {
            findings.push({
              type: 'File',
              vmName,
              detail: `Found: ${filePath}`
            })
            break // Found one file for this VM, move to next
          }
        } catch {
          // File check failed
        }
      }
    }

    return findings
  }

  private async checkWMI(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []
    const detectedVMs = new Set<string>()

    // Check computer system manufacturer and model
    try {
      const csOutput = await asyncExec(
        'wmic computersystem get Manufacturer,Model /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      for (const [vmName, indicators] of Object.entries(WMI_VM_INDICATORS)) {
        for (const indicator of indicators) {
          if (csOutput.toLowerCase().includes(indicator.toLowerCase()) && !detectedVMs.has(vmName)) {
            // Extract the actual value
            const manufacturerMatch = csOutput.match(/Manufacturer=(.+)/i)
            const modelMatch = csOutput.match(/Model=(.+)/i)
            const value = manufacturerMatch?.[1]?.trim() || modelMatch?.[1]?.trim() || indicator

            findings.push({
              type: 'WMI',
              vmName,
              detail: `Win32_ComputerSystem: ${value}`
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // WMI computer system check failed
    }

    // Check BIOS serial number
    try {
      const biosOutput = await asyncExec(
        'wmic bios get SerialNumber /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      // VMware BIOS often has "VMware" in serial
      if (biosOutput.toLowerCase().includes('vmware') && !detectedVMs.has('VMware')) {
        findings.push({
          type: 'WMI',
          vmName: 'VMware',
          detail: 'Win32_BIOS: VMware serial detected'
        })
        detectedVMs.add('VMware')
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
              type: 'WMI',
              vmName,
              detail: `Win32_DiskDrive: ${indicator} disk detected`
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // Disk check failed
    }

    // Check baseboard
    try {
      const baseboardOutput = await asyncExec(
        'wmic baseboard get Manufacturer,Product /FORMAT:LIST 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT }
      )

      for (const [vmName, indicators] of Object.entries(WMI_VM_INDICATORS)) {
        if (detectedVMs.has(vmName)) continue

        for (const indicator of indicators) {
          if (baseboardOutput.toLowerCase().includes(indicator.toLowerCase())) {
            findings.push({
              type: 'WMI',
              vmName,
              detail: `Win32_BaseBoard: ${indicator} baseboard detected`
            })
            detectedVMs.add(vmName)
            break
          }
        }
      }
    } catch {
      // Baseboard check failed
    }

    return findings
  }

  private async checkHardware(): Promise<VMFinding[]> {
    const findings: VMFinding[] = []

    try {
      // Use wmic to get PCI device information
      const output = await asyncExec(
        'wmic path Win32_PnPEntity get DeviceID /FORMAT:CSV 2>nul',
        { timeout: VMScanner.EXEC_TIMEOUT, maxBuffer: VMScanner.BUFFER_SIZE }
      )

      const outputUpper = output.toUpperCase()

      for (const [vmName, vendorIds] of Object.entries(VM_PCI_VENDORS)) {
        for (const vendorId of vendorIds) {
          if (outputUpper.includes(vendorId)) {
            findings.push({
              type: 'Hardware',
              vmName,
              detail: `PCI Vendor ID ${vendorId} detected`
            })
            break // Found one for this VM
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

    for (const [vmName, envVars] of Object.entries(VM_ENV_VARS)) {
      for (const envVar of envVars) {
        if (process.env[envVar]) {
          findings.push({
            type: 'Environment',
            vmName,
            detail: `Environment variable: ${envVar}`
          })
        }
      }
    }

    // Additional check for Windows Sandbox
    if (process.env.COMPUTERNAME?.toLowerCase().includes('wdagutility')) {
      findings.push({
        type: 'Environment',
        vmName: 'Windows Sandbox',
        detail: 'Windows Defender Application Guard environment detected'
      })
    }

    return findings
  }
}
