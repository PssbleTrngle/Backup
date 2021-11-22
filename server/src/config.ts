import dotenv from 'dotenv'

dotenv.config()

const port = Number.parseInt(process.env.PORT ?? '80')
const source = process.env.SOURCE || '/host'
const saveLocal = process.env.LOCAL === 'true'

export default {
   port,
   source,
   saveLocal,
}
