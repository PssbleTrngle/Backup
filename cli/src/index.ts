import arg from 'arg'
import axios, { AxiosError } from 'axios'
import chalk from 'chalk'
import { createWriteStream, mkdirSync, statSync } from 'fs'
import { DateTime } from 'luxon'
import open from 'open'
import { join } from 'path'
import { dirname } from 'path/posix'
import bytes from 'pretty-bytes'
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

interface Message {
   message?: string
   timestamp: number
   progress: {
      total: number
      index?: number
      size?: number
   }
}

async function run() {
   const args = arg({
      '--config': String,
      '--edit-config': Boolean,
      '--open': Boolean,
      '--to': String,
      '--password': String,
      '-o': '--open',
      '-c': '--config',
   })

   if (args['--edit-config']) return openConfig()

   const config = await getConfig(args['--config'])

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

   const https = config.server.startsWith('https://')
   if (!https) console.warn(chalk`{yellow Using http is not recommended}`)

   const request = axios.create({
      baseURL: config.server,
      responseType: 'stream',
      headers,
   })

   const ws = new WebSocket(config.server.replace('http', 'ws'), { headers })

   ws.on('error', e => console.error(e))

   ws.on('message', data => {
      const { message, progress } = JSON.parse(data.toString()) as Message
      const { total, index, size } = progress
      const base = Math.ceil(Math.log10(total))
      const counter = index ? `${`${index + 1}`.padStart(base)}/${total}` : 'done'.padStart(base + 2).padEnd(base * 2)
      const bar = '\u2588'.repeat(((index ?? total) / total) * 20).padEnd(20, '\u2591')
      let line = chalk`${counter} {gray ${bar}} ${message}`
      if (size) line += chalk` {gray (${bytes(size)})}`
      replaceLine(line)
   })

   await new Promise<void>(res => ws.on('open', res))

   console.log(chalk`Requesting backup from {underline ${config.server}}...`)
   const { data } = await request.post('/', config)

   const timestamp = DateTime.now().toFormat('yyyy-MM-dd HH-mm-ss-S')
   const output = args['--to'] || join(config.output, `backup-${timestamp}.zip`)
   mkdirSync(dirname(output), { recursive: true })
   const stream = createWriteStream(output)
   data.pipe(stream)

   await new Promise<void>(res => stream.on('close', res))
   ws.close()

   const { size } = statSync(output)

   replaceLine(chalk`{green Backup successfully saved to {underline ${output}}} (${bytes(size)})`, true)
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
