import _ = require('lodash')
import { sendSuccess, sendError } from '../../cfn-response'
import { EventSource, fromCloudFormation, Lambda } from '../lambda'

export const createLambda = (opts) => {
  const lambda = fromCloudFormation(opts)
  return lambda.use(createMiddleware(lambda, opts))
}

export const createMiddleware = (lambda:Lambda, opts?:any) => {
  const { bot } = lambda
  return async (ctx, next) => {
    const { event, context } = ctx
    const { RequestType, ResourceProperties, ResponseURL } = event
    lambda.logger.debug(`received stack event: ${RequestType}`)

    let type = RequestType.toLowerCase()
    ctx.event = {
      type: type === 'create' ? 'init' : type,
      payload: ResourceProperties
    }

    let err
    try {
      await bot.hooks.fire('init', ctx.event)
    } catch (e) {
      err = e
    }

    if (ResponseURL) {
      const respond = err ? sendError : sendSuccess
      const data = err ? _.pick(err, ['message', 'stack']) : {}
      await respond(event, context, data)
    }

    if (err) throw err

    await next()
  }
}
