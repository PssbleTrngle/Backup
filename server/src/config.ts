import dotenv from 'dotenv'

dotenv.config()

const port = Number.parseInt(process.env.PORT ?? '80')
const source = process.env.SOURCE || '/host'
const saveLocal = process.env.LOCAL === 'true'
const password = process.env.PASSWORD

if (!password) throw new Error('Password missing in environmental variables')

export default {
   port,
   source,
   saveLocal,
   password,
}
