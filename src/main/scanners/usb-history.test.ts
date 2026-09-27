import { describe, it, expect } from 'vitest'
import {
  assessUsbWipe, lookupBySerial, normalizeSerial, parsePartitionEvents, parseSetupapiUsb, parseUsbstorRegistry
} from './usb-history'

const REG = [
  'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR\\Disk&Ven_SanDisk&Prod_Cruzer_Blade&Rev_1.00\\4C530001230516118252&0',
  '    FriendlyName    REG_SZ    SanDisk Cruzer Blade USB Device',
  '',
  'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR\\Disk&Ven_Kingston&Prod_DataTraveler_3.0&Rev_\\E0D55EA573DCF450E97C0B5A&0',
  '    FriendlyName    REG_SZ    Kingston DataTraveler 3.0 USB Device',
  '',
  'End of search: 2 match(es) found.'
].join('\r\n')

const SETUPAPI = [
  '>>>  [Device Install (Hardware initiated) - USBSTOR\\Disk&Ven_SanDisk&Prod_Cruzer_Blade&Rev_1.00\\4C530001230516118252&0]',
  '>>>  Section start 2025/03/12 10:00:05.123',
  '<<<  Section end 2025/03/12 10:00:09.001',
  '>>>  [Device Install (Hardware initiated) - SWD\\WPDBUSENUM\\_??_USBSTOR#Disk&Ven_Generic&Prod_Flash_Disk&Rev_8.07#99A1B2C3&0#{53f56307-b6bf-11d0-94f2-00a0c91efb8b}]',
  '>>>  Section start 2026/09/20 18:40:00.000'
].join('\r\n')

const partitionXml = (serial: string, iso: string) =>
  `<Event><System><EventID>1006</EventID><TimeCreated SystemTime='${iso}'/></System><EventData>` +
  `<Data Name='Manufacturer'>SanDisk</Data><Data Name='SerialNumber'>${serial}</Data></EventData></Event>`

describe('USB history', () => {
  it('normalizes serials', () => {
    expect(normalizeSerial('4C530001230516118252&0')).toBe('4c530001230516118252')
  })

  it('lists USBSTOR devices from the registry', () => {
    expect(parseUsbstorRegistry(REG)).toEqual([
      { serial: '4c530001230516118252', name: 'SanDisk Cruzer Blade USB Device' },
      { serial: 'e0d55ea573dcf450e97c0b5a', name: 'Kingston DataTraveler 3.0 USB Device' }
    ])
    expect(parseUsbstorRegistry('')).toEqual([])
  })

  it('reads first-install times from setupapi.dev.log in both id forms', () => {
    const m = parseSetupapiUsb(SETUPAPI)
    expect(m.get('4c530001230516118252')).toBe(new Date(2025, 2, 12, 10, 0, 5).getTime())
    expect(m.get('99a1b2c3')).toBe(new Date(2026, 8, 20, 18, 40, 0).getTime())
  })

  it('keeps the latest Partition/Diagnostic connection per serial', () => {
    const m = parsePartitionEvents(
      partitionXml('4C530001230516118252', '2026-09-01T10:00:00Z') + partitionXml('4C530001230516118252', '2026-09-27T12:20:00Z')
    )
    expect(m.get('4c530001230516118252')).toBe(Date.parse('2026-09-27T12:20:00Z'))
  })

  it('matches serials that differ only by a suffix', () => {
    expect(lookupBySerial(new Map([['4c530001230516118252', 1]]), '4c530001230516118252')).toBe(1)
    expect(lookupBySerial(new Map([['abc123', 7]]), 'abc123xyz')).toBe(7)
    expect(lookupBySerial(new Map(), 'x')).toBeUndefined()
  })

  describe('assessUsbWipe', () => {
    const now = new Date(2026, 8, 27, 14, 0).getTime()
    const setup = parseSetupapiUsb(SETUPAPI)

    it('flags a recently installed device that vanished from the registry', () => {
      const out = assessUsbWipe(setup, parseUsbstorRegistry(REG), now)
      expect(out).toHaveLength(1)
      expect(out[0]).toContain('1 storage device(s)')
    })

    it('ignores old devices Windows may have cleaned up itself', () => {
      const oldOnly = new Map([['4c530001230516118252', new Date(2025, 0, 1).getTime()]])
      expect(assessUsbWipe(oldOnly, [], now)).toEqual([])
    })

    it('is quiet when every recent device is still in the registry', () => {
      const reg = [...parseUsbstorRegistry(REG), { serial: '99a1b2c3', name: 'Generic Flash Disk' }]
      expect(assessUsbWipe(setup, reg, now)).toEqual([])
    })

    it('never concludes anything when the registry could not be read', () => {
      expect(assessUsbWipe(setup, null, now)).toEqual([])
    })
  })
})
