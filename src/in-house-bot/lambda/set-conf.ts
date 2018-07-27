// @ts-ignore
import Promise from 'bluebird'
import { EventSource } from '../../lambda'
import { createConf } from '../configure'
import { createBot } from '../../'

const bot = createBot()
const lambda = bot.createLambda({ source: EventSource.LAMBDA })
const conf = createConf({ bot })

lambda.use(async (ctx) => {
  if (typeof ctx.event === 'string') {
    ctx.event = JSON.parse(ctx.event)
  }

  ctx.body = await conf.update(ctx.event)
  await bot.forceReinitializeContainers()
})

export const handler = lambda.handler
