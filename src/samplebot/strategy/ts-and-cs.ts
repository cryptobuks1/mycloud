import crypto = require('crypto')
import dotProp = require('dot-prop')
import { TYPE } from '@tradle/constants'
import { DatedValue } from '../../types'
import Logger from '../../logger'

const TERMS_AND_CONDITIONS = 'tradle.TermsAndConditions'
const DATE_PRESENTED_PROP = 'tsAndCsState.datePresented'
const DATE_ACCEPTED_PROP = 'tsAndCsState.datePresented'

export const createPlugin = ({
  logger,
  productsAPI,
  termsAndConditions
}: {
  logger: Logger,
  productsAPI: any,
  termsAndConditions: DatedValue
}) => {
  const onmessage = async (req) => {
    const { user, payload, type } = req
    if (type === TERMS_AND_CONDITIONS &&
      payload.termsAndConditions.trim() === termsAndConditions.value.trim()) {
      logger.debug(`updating ${user.id}.${DATE_ACCEPTED_PROP}`)
      dotProp.set(user, DATE_ACCEPTED_PROP, Date.now())
      return
    }

    const accepted = await ensureAccepted({
      termsAndConditions,
      user,
      productsAPI,
      logger
    })

    if (!accepted) return false // exit middleware
  }

  return {
    onmessage
  }
}

export const ensureAccepted = async ({
  req,
  termsAndConditions,
  user,
  productsAPI,
  logger
}: {
  req?: any,
  termsAndConditions: DatedValue,
  user: any,
  productsAPI: any,
  logger: Logger
}) => {
  const dateAccepted = dotProp.get(user, DATE_ACCEPTED_PROP)
  if (dateAccepted && dateAccepted > termsAndConditions.lastModified) {
    return true
  }

  const datePresented = dotProp.get(user, DATE_PRESENTED_PROP)
  if (!(datePresented && datePresented > termsAndConditions.lastModified)) {
    dotProp.set(user, DATE_PRESENTED_PROP, Date.now())

    logger.debug(`requesting ${user.id} to accept T's and C's`)
    await productsAPI.requestItem({
      req: req || productsAPI.state.newRequestState({ user }),
      item: {
        form: 'tradle.TermsAndConditions',
        prefill: {
          [TYPE]: 'tradle.TermsAndConditions',
          termsAndConditions: termsAndConditions.value
        }
      }
    })
  }

  logger.debug(`${user.id} has still not accepted T's and C's!`)
  return false
}
