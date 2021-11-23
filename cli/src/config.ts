import { underline } from 'chalk'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import open from 'open'
import { homedir } from 'os'
import { dirname, resolve } from 'path'
import yaml from 'yaml'

const configDir = resolve(homedir(), '.config/backup')
const configPath = resolve(configDir, 'config.yml')

export interface Config {
   extends?: string
   server: string
   output: string
   level?: number
   paths: string[]
   'paths-ignore'?: string[]
}

const defaultConfig: Partial<Config> = {
   paths: [],
}

function resolveConfig(name: string): { path: string; config?: Partial<Config> } {
   if (existsSync(name)) {
      const content = readFileSync(name).toString()
      const config = yaml.parse(content)
      return { config, path: name }
   }

   if (/^[\w\s-_]+$/.test(name)) {
      const namedConfig = resolve(configDir, `${name}.yml`)
      return resolveConfig(namedConfig)
   }

   return { path: name }
}

function ensureConfig(name: string, createMissing = true) {
   const res = resolveConfig(name)
   if (res.config) return res as { path: string; config: Partial<Config> }

   if (!createMissing) throw new Error(`Can not resolve config '${name}'`)

   mkdirSync(dirname(res.path), { recursive: true })
   writeFileSync(res.path, yaml.stringify(defaultConfig))
   return { ...res, config: defaultConfig }
}

function checkConfig(partial: Partial<Config>): Config {
   if (!partial.server) throw new Error('Server URL missing in config')
   return { paths: [], output: resolve(homedir(), 'downloads'), server: 'MISSING', ...partial }
}

function getConfigRecursive(path: string, children: string[] = []): Partial<Config> {
   const base = ensureConfig(path, children.length === 0)
   if (children.includes(base.path))
      throw new Error(`Circular Dependency ${children.map(c => underline(c)).join(' -> ')}`)

   if (base.config.extends) {
      const parent = getConfigRecursive(base.config.extends, [...children, base.path])

      return [parent, base.config].reduce((a, b) => {
         return {
            ...a,
            ...b,
            paths: [...(a.paths ?? []), ...(b.paths ?? [])],
            'paths-ignore': [...(a['paths-ignore'] ?? []), ...(b['paths-ignore'] ?? [])],
         }
      })
   }

   return base.config
}

function getConfig(path = configPath): Config {
   const partial = getConfigRecursive(path)
   return checkConfig(partial)
}

export function openConfig(name = configPath) {
   const { path } = ensureConfig(name)
   console.log('Opening config...')
   if (path) return open(path)
}

export default getConfig
