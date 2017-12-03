import '../../../init-lambda'

import express = require('express')
import coexpress = require('co-express')
import cors = require('cors')
import helmet = require('helmet')
import { createBot } from '../../../bot'
import { createConf } from '../../configure'

const bot = createBot()
const { router } = bot
const conf = createConf(bot)
const infoRouter = express.Router()
infoRouter.use(cors())
infoRouter.use(helmet())
infoRouter.get('/', coexpress(function* (req, res) {
  const result = yield conf.getPublicConf()
  // HACK ALERT
  // this belongs in bot engine
  result.aws = true
  result.iotParentTopic = bot.env.IOT_PARENT_TOPIC
  result.version = bot.version
  res.json(result)
}))

infoRouter.use(router.defaultErrorHandler)
router.use('/info', infoRouter)
bot.ready()

export const handler = bot.createHttpHandler()
