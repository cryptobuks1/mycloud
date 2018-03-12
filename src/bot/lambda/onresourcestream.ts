// @ts-ignore
import Promise from 'bluebird'
import { Lambda } from '../../types'
import { topics as EventTopics } from '../../events'
import { EventSource, fromDynamoDB } from '../lambda'

export const createLambda = (opts) => {
  const lambda = fromDynamoDB(opts)
  return lambda.use(createMiddleware(lambda, opts))
}

export const createMiddleware = (lambda:Lambda, opts?:any) => {
  const { bot } = lambda
  return async (ctx, next) => {
    const partials = bot.dbUtils.getRecordsFromEvent(ctx.event)
      .map(record => record.new)
      .filter(partial => partial)

    const objects = await Promise.all(partials.map(({ _link }) => bot.objects.get(_link)))
    await bot.fire(EventTopics.resource.batchSave, objects)
    await Promise.mapSeries(objects, async (object) => {
      await bot.fire(EventTopics.resource.save, { object })
    })
  }
}
