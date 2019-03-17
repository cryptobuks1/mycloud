import compose from 'koa-compose'
import cors from 'kcors'
import once from 'lodash/once'
import { bodyParser } from '../middleware/body-parser'
import { route } from '../middleware/noop-route'
import { Bot, ILambdaExecutionContext } from '../types'
import {
  onMessage as onMessageInInbox,
  createSuccessHandler,
  createErrorHandler
} from '../middleware/inbox'
import { onMessage } from '../middleware/onmessage'
import { onMessagesSaved } from '../middleware/onmessagessaved'
import { topics as EventTopics } from '../events'

const MODELS_PACK = 'tradle.ModelsPack'

export const createMiddleware = () => {
  const hookUp = once(async (bot: Bot) => {
    const { logger } = bot
    bot.tasks.add({
      name: 'getkeys',
      promiser: bot.identity.getPrivate
    })

    bot.hook(EventTopics.message.inbound.sync, async (ctx, next) => {
      const { type, payload, user } = ctx.event
      bot.tasks.add({
        name: 'reset-delivery-error',
        promiser: () => bot.delivery.http.resetError({ counterparty: user.id })
      })

      if (type === MODELS_PACK) {
        try {
          await bot.modelStore.addModelsPack({
            modelsPack: payload,
            validateAuthor: true,
            // unfortunately we have to be more forgiving of other myclouds
            // than of ourselves, and allow them to remove models (for now)
            allowRemoveModels: true
          })
        } catch (err) {
          logger.error(err.message, { modelsPack: payload })
          return // prevent further processing
        }

        await next()
      }
    })
  })

  return compose([
    (ctx: ILambdaExecutionContext, next) => hookUp(ctx.components.bot).then(next),
    route(['post', 'put']),
    cors(),
    bodyParser({ jsonLimit: '10mb' }),
    onMessageInInbox(),
    onMessage({
      onSuccess: createSuccessHandler(),
      onError: createErrorHandler()
    }),
    onMessagesSaved()
  ])
}
