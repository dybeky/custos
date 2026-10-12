import { app } from 'electron'
import { join } from 'path'

/**
 * The bundled resources/ folder (settings, keywords, hashes, signatures).
 *
 * A packaged build reads the copy inside app.asar, which the exe's embedded
 * integrity check covers. A loose copy outside it would sit in the portable
 * exe's unpack folder in %TEMP%, where the checked player could edit
 * keywords.json or the pinned signature key while Custos is open.
 * In development: the project's resources/ folder.
 */
export function resourceDir(): string {
  return app.isPackaged ? join(app.getAppPath(), 'resources') : join(process.cwd(), 'resources')
}
