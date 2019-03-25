import _ from 'lodash'
import { TYPE } from '@tradle/constants'
import { CreatePlugin, IPluginLifecycleMethods } from '../types'

const DEFAULT_CONF = require('../../../data/in-house-bot/form-prefills.json')

export const name = 'prefill-form'
export const createPlugin: CreatePlugin<void> = (components, { conf = DEFAULT_CONF, logger }) => {
  const plugin: IPluginLifecycleMethods = {}
  plugin.willRequestForm = ({ user, application, formRequest }) => {
    const appSpecific = application && conf[application.requestFor]
    const { form, prefill } = formRequest
    if (prefill) return

    let values
    if (appSpecific) {
      values = appSpecific[form]
    }

    if (!values) {
      values = conf[form]
    }

    if (values) {
      logger.debug(`set prefill on form request for: ${form}`)
      formRequest.prefill = _.extend(
        {
          [TYPE]: form
        },
        values
      )
    }
  }

  return {
    plugin
  }
}
