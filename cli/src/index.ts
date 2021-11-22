import arg from 'arg'
import axios, { AxiosError } from 'axios'
import chalk from 'chalk'
import { createWriteStream, mkdirSync } from 'fs'
import { DateTime } from 'luxon'
import open from 'open'
import { join } from 'path'
import { basename, dirname } from 'path/posix'
import prompt from 'prompt'
import { Stream } from 'stream'
import { WebSocket } from 'ws'
import getConfig, { openConfig } from './config'

function replaceLine(message: string, newLine = false) {
   process.stdout.clearLine(0)
   process.stdout.cursorTo(0)
   if (newLine) console.log(message)
   else process.stdout.write(message)
}

async function run() {
   const args = arg({
      '--config': Boolean,
      '--open': Boolean,
      '--to': String,
      '--password': String,
      '-o': '--open',
      '-c': '--config',
   })

   if (args['--config']) return openConfig()

   const config = await getConfig()

   const getPassword = async () => {
      if (args['--password']) {
         console.warn(chalk`{yellow Passing the password in the command is not recommended}`)
         return args['--password']
      }
      prompt.start({ message: 'Input' })
      const { password } = await prompt.get([
         { name: 'password', required: true, allowEmpty: false, hidden: true } as any,
      ])
      return password as string
   }

   const headers = {
      Authorization: await getPassword(),
   }

   const request = axios.create({
      baseURL: `http://${config.server}`,
      responseType: 'stream',
      headers,
   })

   const ws = new WebSocket(`ws://${config.server}`, { headers })

   ws.on('error', e => console.error(e))

   ws.on('message', data => {
      const { file, pattern, total, index, startedAt } = JSON.parse(data.toString())
      const name = basename(file)
      const base = Math.ceil(Math.log10(total))
      const progress = `${`${index + 1}`.padStart(base)}/${total}`
      const bar  = '\u2588'.repeat(index / total * 20).padEnd(20, '\u2591')
      replaceLine(chalk`${progress} ${bar} {underline ${name}}`)
   })

   await new Promise<void>(res => ws.on('open', res))

   console.log(chalk`Requesting backup from {underline ${config.server}}...`)
   const { data } = await request.post('/', { paths: config.paths })

   const timestamp = DateTime.now().toFormat('yyyy-MM-dd HH-mm-ss-S')
   const output = args['--to'] || join(config.output, `backup-${timestamp}.zip`)
   mkdirSync(dirname(output), { recursive: true })
   const stream = createWriteStream(output)
   data.pipe(stream)

   await new Promise<void>(res => stream.on('close', res))

   ws.close()
   replaceLine(chalk`{green Backup successfully saved to {underline ${output}}}`, true)
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
