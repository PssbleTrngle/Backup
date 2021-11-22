import arg from 'arg'
import axios, { AxiosError } from 'axios'
import chalk from 'chalk'
import { createWriteStream, mkdirSync } from 'fs'
import { DateTime } from 'luxon'
import open from 'open'
import { join } from 'path'
import { dirname } from 'path/posix'
import prompt from 'prompt'
import { Stream } from 'stream'
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

   prompt.start({ message: 'Input' })
   const { password } = await prompt.get([{ name: 'password', required: true, allowEmpty: false, hidden: true } as any])

   const request = axios.create({
      baseURL: config.server,
      responseType: 'stream',
      headers: {
         Authorization: password as string,
      },
   })

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

function isAxiosError(e: unknown): e is AxiosError {
   return (e as AxiosError).isAxiosError
}

function streamToString(stream: Stream) {
   const chunks: Buffer[] = []
   return new Promise<string>((resolve, reject) => {
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
      stream.on('error', err => reject(err))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
   })
}

run().catch(async e => {
   if (isAxiosError(e)) {
      const response = JSON.parse(await streamToString(e.response?.data))
      console.error(chalk.red(response.message || e.message))
   } else {
      console.error(chalk.red(e.message))
   }
})
