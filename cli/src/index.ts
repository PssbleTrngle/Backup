import arg from 'arg'
import axios from 'axios'
import chalk from 'chalk'
import { createWriteStream, mkdirSync } from 'fs'
import { DateTime } from 'luxon'
import open from 'open'
import { join } from 'path'
import { dirname } from 'path/posix'
import getConfig, { openConfig } from './config'

async function run() {
   const args = arg({
      '--config': Boolean,
      '--open': Boolean,
      '--to': String,
      '-o': '--open',
      '-c': '--config',
   })

   if (args['--config']) return openConfig()

   const config = await getConfig()
   const request = axios.create({ baseURL: config.server, responseType: 'stream' })

   console.log(chalk`Requesting backup from {underline ${config.server}}...`)
   const { data } = await request.post('/', { paths: config.paths })

   const timestamp = DateTime.now().toFormat('yyyy-MM-dd HH-mm-ss-S')
   const output = args['--to'] || join(config.output, `backup-${timestamp}.zip`)
   mkdirSync(dirname(output), { recursive: true })
   const stream = createWriteStream(output)
   data.pipe(stream)

   await new Promise<void>(res => stream.on('close', res))

   console.log(chalk`{green Backup successfully saved to {underline ${output}}}`)
   if (args['--open']) await open(output)
}

run().catch(e => console.error(chalk.red(e.message)))
