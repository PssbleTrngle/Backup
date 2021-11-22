import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import open from 'open'
import { homedir } from 'os'
import { dirname, resolve } from 'path'
import yaml from 'yaml'

const configPath = resolve(homedir(), '.config/backup/config.yml')

export interface Config {
   server: string
   output: string
   paths: string[]
}

const defaultConfig = {
   paths: [],
   output: resolve(homedir(), 'downloads'),
}

async function getConfig(path = configPath): Promise<Config> {
   if (existsSync(path)) {
      const content = readFileSync(path).toString()
      const parsed = yaml.parse(content)
      const config: Config = { ...defaultConfig, ...parsed }

      if (!config.server) throw new Error('Server URL missing in config')

      return config
   } else {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, yaml.stringify(defaultConfig))
      return getConfig()
   }
}

export function openConfig() {
   console.log('Opening config...')
   return open(configPath)
}

export default getConfig
