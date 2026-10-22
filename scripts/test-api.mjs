// Runs the backend test suite with the project's virtualenv if it exists: `npm run test:api`.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const venvPython = process.platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python')
const python = existsSync(venvPython) ? venvPython : process.platform === 'win32' ? 'python' : 'python3'
const r = spawnSync(python, ['-m', 'pytest', '-q', 'tests'], { cwd: root, stdio: 'inherit' })
process.exit(r.status ?? 1)
