import { Lambda, EventSource, fromSchedule } from '../lambda'
import { IFailureQueryOpts } from '../../seals'

const SIX_HOURS = 6 * 3600 * 1000

export const createLambda = (opts) => {
  const lambda = fromSchedule(opts)
  return lambda.use(createMiddleware(lambda, opts))
}

export const createMiddleware = (lambda, opts:IFailureQueryOpts={}) => {
  const { gracePeriod=SIX_HOURS } = opts
  const { seals } = lambda.tradle
  return async (ctx, next) => {
    ctx.seals = await seals.handleFailures({ gracePeriod })
    await next()
  }
}
