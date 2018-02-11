import _ = require('lodash')
import { models } from '@tradle/models'
import validateResource = require('@tradle/validate-resource')
import createProductsStrategy from './'
import { createBot } from '../bot'
import { createConf } from './configure'
import Errors = require('../errors')
import { toPromise } from '../utils'
import { BotComponents, CustomizeBotOpts, CacheableBucketItem } from './types'

export async function customize (opts:CustomizeBotOpts):Promise<BotComponents> {
  let { lambda, bot, delayReady, event, conf } = opts
  if (!bot) bot = lambda.bot

  const { logger } = lambda || bot
  const confy = createConf({ bot })
  let [
    // org,
    botConf,
    modelsPack,
    style,
    termsAndConditions
  ] = await Promise.all([
    // confy.org.get(),
    (conf && conf.bot) || confy.botConf.get().catch(Errors.ignoreNotFound),
    (conf && conf.modelsPack) || confy.modelsPack.get().catch(Errors.ignoreNotFound),
    (conf && conf.style) || confy.style.get().catch(Errors.ignoreNotFound),
    (conf && conf.termsAndConditions)
      ? Promise.resolve({ value: conf.termsAndConditions })
      : confy.termsAndConditions.getDatedValue()
        // ignore empty values
        .then(datedValue => datedValue.value && datedValue)
        .catch(Errors.ignoreNotFound)
  ].map(toPromise))

  // const { domain } = org
  if (modelsPack) {
    bot.modelStore.setCustomModels(modelsPack)
  }

  if (style) {
    try {
      validateResource.resource({ models, resource: style })
    } catch (err) {
      bot.logger.error('invalid style', err.stack)
      style = null
    }
  }

  conf = {
    bot: botConf,
    style,
    termsAndConditions,
    modelsPack
  }

  const components = createProductsStrategy({
    bot,
    logger,
    // namespace,
    conf,
    event
  })

  if (!opts.delayReady) bot.ready()

  return {
    ...components,
    conf,
    style
  }
}
