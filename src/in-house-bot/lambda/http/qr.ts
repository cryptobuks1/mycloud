import _ = require('lodash')
import QR = require('@tradle/qr')
import promisify = require('pify')
import * as Koa from 'koa'
import { createBot } from '../../../bot'
import { EventSource } from '../../../lambda'
import { appLinks } from '../../../app-links'
import { IDeepLink, IApplyForProductDeepLink, IImportDataDeepLink } from '../../types'

const createDataURL = promisify(QR.toDataURL)
const bot = createBot({ ready: false })
const getPermalink = bot.getMyIdentityPermalink()
getPermalink.then(() => bot.ready())

const lambda = bot.createLambda({ source: EventSource.HTTP })
const descriptions = {
  ImportData: (data: IImportDataDeepLink) => `scan this QR code with the Tradle app to claim the bundle with claimId: ${data.dataHash}`,
  AddProvider: (data: IDeepLink) => `scan this QR code with the Tradle app or open <a href="${appLinks.getChatLink(data)}">this link</a> on your mobile device to add this provider to your Conversations screen`,
  ApplyForProduct: (data: IApplyForProductDeepLink) => `scan this QR code with the Tradle app or open <a href="${appLinks.getApplyForProductLink(data)}">this link</a> on your mobile device to add this provider to your Conversations screen, and apply for ${data.product}`,
}

lambda.use(async (ctx:Koa.Context, next) => {
  const { query={} } = ctx
  let { schema, ...data } = query
  const provider = await getPermalink
  const host = bot.apiBaseUrl
  if (!schema) {
    ({ schema, data } = appLinks.inferSchemaAndData({ provider, host, data }))
  }

  const dataUrl = await createDataURL({ schema, data })
  const description = descriptions[schema](data)

  ctx.body = `
<html>
  <body>
    <h1>Type: ${schema}</h1>
    <p>${description}</p>
    <img src="${dataUrl}" width="300" height="300" />
  </body>
</html>`
})

export const handler = lambda.handler
