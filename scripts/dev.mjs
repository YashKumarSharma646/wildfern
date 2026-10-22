// Runs the FastAPI backend and the Vite dev server together: `npm run dev:all`.
// Pass `api` to run only the backend: `npm run api`.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const venvPython = process.platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python')
const python = existsSync(venvPython) ? venvPython : process.platform === 'win32' ? 'python' : 'python3'

const procs = []
// On Windows, killing a shell/launcher leaves its children (uvicorn's worker, Vite)
// running and holding the ports, so take down the whole process tree.
const killTree = (p) => {
  if (p.exitCode !== null || !p.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
  else p.kill('SIGTERM')
}
const shutdown = (code = 0) => {
  procs.forEach(killTree)
  process.exit(code)
}
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' })
  p.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`)
    shutdown(code ?? 0)
  })
  procs.push(p)
}

run('api', python, ['-m', 'uvicorn', 'backend.main:app', '--reload', '--port', '8000', '--reload-dir', 'backend'])
if (process.argv[2] !== 'api') run('web', 'npx', ['vite'])

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => shutdown(0))
