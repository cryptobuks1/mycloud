import cors from 'kcors'
import compose from 'koa-compose'
import { post } from '../middleware/noop-route'
import { bodyParser } from '../middleware/body-parser'
import { ILambdaExecutionContext } from '../types'
import { getRequestIps } from '../utils'

const preauth = () => async (ctx: ILambdaExecutionContext, next) => {
  const { bot } = ctx.components
  const { auth } = bot
  const ips = getRequestIps(ctx.request)
  const { clientId, identity } = ctx.event
  ctx.session = await auth.createSession({ clientId, identity, ips })
  ctx.session.connectEndpoint = bot.endpointInfo
  ctx.session.region = bot.env.AWS_REGION
  if (bot.isEmulated) {
    ctx.session.s3Endpoint = bot.aws.s3.endpoint.host
  }

  await next()
  if (!ctx.body) ctx.body = ctx.session
}

export const createMiddleware = () => compose([post(), cors(), bodyParser(), preauth()])
