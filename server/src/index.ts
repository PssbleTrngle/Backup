import archiver from 'archiver'
import bodyparser from 'body-parser'
import { celebrate, isCelebrateError, Joi } from 'celebrate'
import express, { NextFunction, Request, Response } from 'express'
import ws from 'express-ws'
import { createWriteStream, mkdirSync, statSync } from 'fs'
import glob from 'glob'
import { basename, join } from 'path'
import config from './config'

const wss = ws(express())
const { app } = wss

app.use(bodyparser.json())
app.use(bodyparser.urlencoded({ extended: true }))

app.use((req, res, next) => {
   if (config.password === req.headers.authorization) next()
   else res.status(400).json({ message: 'Invalid password' })
})

app.ws('/', client => {
   const { clients } = wss.getWss()
   client.ping()
   clients.forEach(c => {
      if (c !== client) c.close()
   })
})

function broadcast(message: Record<string, unknown>) {
   const { clients } = wss.getWss()
   message.timestamp = Date.now()
   clients.forEach(client => client.send(JSON.stringify(message)))
}

app.post(
   '/',
   celebrate(
      {
         body: {
            level: Joi.number().min(1).max(9).optional(),
            paths: Joi.array().items(Joi.string()).required(),
         },
      },
      { stripUnknown: true }
   ),
   async (req, res, next) => {
      console.group('Backup requested')

      try {
         const paths = req.body.paths as string[]
         const level = req.body.level as number
         const matches = paths.map(pattern => glob.sync(pattern, { cwd: config.source }))
         console.log(`Found ${matches.length} matching paths`)

         const timestamp = Date.now()
         const zipName = `backup-${timestamp}.zip`

         const archive = archiver('zip', { zlib: { level } })

         archive.on('error', e => {
            console.log('Archive error:')
            archive.finalize()
            next(e)
         })

         if (config.saveLocal) {
            mkdirSync('temp', { recursive: true })
            const stream = createWriteStream(join('temp', zipName))
            archive.pipe(stream)

            stream.on('close', () => {
               const size = archive.pointer()
               console.log(`Backup finished with ${size} bytes`)
               res.json({ matches, size })
            })
         } else {
            archive.pipe(res)
         }

         archive.on('finish', () => console.log(`Backup finished with ${archive.pointer()} bytes`))

         const total = matches.reduce((t, a) => t + a.length, 0)
         let index = 0
         matches.forEach((matches, i) => {
            const pattern = paths[i]
            console.group(`Processing pattern '${pattern}' with ${matches.length} matches`)

            matches.forEach(match => {
               const path = join(config.source, match)
               const info = statSync(path)

               const progress = { total, index }
               broadcast({ message: basename(match), match, pattern, progress })

               if (info.isDirectory()) archive.directory(path, match)
               else archive.file(path, { name: match })
               index++

               console.log(`Added ${match}`)
            })

            console.groupEnd()
         })

         const progress = { total, index: 0 }
         broadcast({ message: 'Finalizing archive', progress })

         archive.on('progress', ({ entries, fs }) => {
            const progress = {
               total: entries.total,
               index: entries.processed,
               size: fs.processedBytes,
            }
            broadcast({ message: 'Finalizing archive', progress })
         })

         console.log('Archived all files')
         await archive.finalize()
         console.log('Closed archive')

         const { clients } = wss.getWss()
         clients.forEach(c => c.close())
      } catch (e) {
         next(e)
      } finally {
         console.groupEnd()
      }
   }
)

app.use((_req, res) => {
   res.status(404).json({ message: 'Not Found' })
})

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
   if (isCelebrateError(err)) {
      const validation: Record<string, { source: string; keys: string[]; message: string }> = {}

      err.details.forEach(({ details }, source) => {
         validation[source] = { source, keys: details.map(d => d.path.join('.')), message: err.message }
      })

      res.status(400).json({
         message: 'Bad Input',
         validation,
      })
   } else {
      next(err)
   }
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
   console.error(err.message)
   if (process.env.NODE_ENV !== 'production') console.error(err.stack)

   res.status(500).json({
      error: {
         message: err.message,
      },
   })
})

async function run() {
   app.listen(config.port)
   console.log(`Listing on port ${config.port}`)
}

run().catch(console.error)
