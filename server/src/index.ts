import archiver from 'archiver'
import bodyparser from 'body-parser'
import { celebrate, isCelebrateError, Joi } from 'celebrate'
import express, { NextFunction, Request, Response } from 'express'
import { createWriteStream, mkdirSync, statSync } from 'fs'
import glob from 'glob'
import { join } from 'path'
import config from './config'

const app = express()
app.use(bodyparser.json())
app.use(bodyparser.urlencoded({ extended: true }))

app.use((req, res, next) => {
   if (config.password === req.headers.authorization) next()
   else res.status(400).json({ message: 'Invalid password' })
})

app.post(
   '/',
   celebrate(
      {
         body: {
            paths: Joi.array().items(Joi.string()).required(),
         },
      },
      { stripUnknown: true }
   ),
   async (req, res, next) => {
      console.group('Backup requested')

      try {
         const paths = req.body.paths as string[]
         const matches = paths.map(pattern => glob.sync(pattern, { cwd: config.source })).reduce((a, b) => [...a, ...b])
         console.log(`Found ${matches.length} matching paths`)

         const timestamp = Date.now()
         const zipName = `backup-${timestamp}.zip`

         const archive = archiver('zip')

         archive.on('error', next)

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

         matches.forEach(match => {
            const path = join(config.source, match)
            const info = statSync(path)
            if (info.isDirectory()) archive.directory(path, match)
            else archive.file(path, { name: match })
            console.log(`Added ${match}`)
         })

         archive.finalize()
      } catch (e) {
         next(e)
      } finally {
         console.groupEnd()
      }
   }
)

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
