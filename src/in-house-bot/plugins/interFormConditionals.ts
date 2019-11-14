import cloneDeep from 'lodash/cloneDeep'
import {
  Bot,
  Logger,
  CreatePlugin,
  Applications,
  ITradleObject,
  IPBApp,
  IPBReq,
  IPluginLifecycleMethods,
  ValidatePluginConf
} from '../types'
import { TYPE } from '@tradle/constants'
import validateResource from '@tradle/validate-resource'
const { parseStub } = validateResource.utils

export const name = 'interFormConditionals'
const PRODUCT_REQUEST = 'tradle.ProductRequest'
const FORM_REQUEST = 'tradle.FormRequest'
const APPLICATION = 'tradle.Application'
const ENUM = 'tradle.Enum'
const CHECK_OVERRIDE = 'tradle.CheckOverride'
export const createPlugin: CreatePlugin<void> = ({ bot }, { conf, logger }) => {
  const plugin: IPluginLifecycleMethods = {
    name: 'interFormConditionals',
    getRequiredForms: async ({ user, application }) => {
      if (!application || !application.forms || !application.forms.length) return

      if (application.processingDataBundle) return []

      bot.logger.debug(`interFormConditionals: for ${application.requestFor}`)
      const { requestFor } = application
      let productForms = conf[requestFor]
      if (!productForms) return

      // const productModel = bot.models[requestFor]
      let promises = []
      application.forms
        .map(appSub => parseStub(appSub.submission))
        .forEach(f => {
          if (f.type !== PRODUCT_REQUEST && f.type !== FORM_REQUEST)
            promises.push(bot.objects.get(f.link))
        })

      let forms = {}
      if (promises.length) {
        try {
          let result = await Promise.all(promises)
          result.forEach(r => (forms[r[TYPE]] = r))
        } catch (err) {
          logger.error('interFormConditionals', err)
        }
      }
      forms = normalizeEnums({ forms, models: bot.models })

      let retForms = []
      productForms.forEach(f => {
        if (typeof f === 'string') {
          retForms.push(f)
          return
        }
        let formId = Object.keys(f)[0]
        if (forms[formId]) {
          retForms.push(formId)
          return
        }
        let values = f[formId]
        let isArray
        if (typeof values === 'string') {
          if (isSet(values)) {
            retForms.push(formId)
            return
          }
          values = [values]
        }
        let hasAction
        values.forEach(val => {
          let isAdd = val.startsWith('add: ')
          if (!isAdd && isSet(val)) return
          hasAction = true
          val = val
            .slice(5)
            .trim()
            .replace(/\s=\s/g, ' === ')
            .replace(/\s!=\s/g, ' !== ')

          try {
            let ret = new Function('forms', 'application', `return ${val}`)(forms, application)
            if (ret) {
              if (isAdd) {
                retForms.push(formId)
                return
              }
            } else if (!isAdd) {
              retForms.push(formId)
              return
            }
          } catch (err) {
            if (err.message.indexOf('Cannot read property') === -1)
              logger.debug(`interFormConditionals: please check formula ${val} for ${formId}`, err)
            // debugger
          }
        })
        if (!hasAction) retForms.push(formId)
      })
      if (application.dataBundle) {
        bot.logger.debug(`Required forms for ${application.requestFor}`)
        retForms.forEach(f => bot.logger.debug(f))
      }
      return retForms
    },
    async onmessage(req: IPBReq) {
      const { payload, application, user } = req
      if (!application || !application.forms || !application.forms.length) return
      //   if (bot.models[payload[TYPE]].subClassOf !== CHECK_OVERRIDE) return
      //   await this.onFormsCollected({ req })
      // },
      // async onFormsCollected({ req }) {
      const conditions = conf[APPLICATION]
      if (!conditions) return
      const all = conditions.all
      let { models } = bot
      // const { user, application } = req
      const forThisProduct = conditions[application.requestFor]
      if (!all && !forThisProduct) return
      const model = models[APPLICATION]
      let settings = (all && all.slice()) || []
      if (forThisProduct) settings = settings.concat(forThisProduct)
      let { allForms, allFormulas, forms } = await getAllToExecute({
        application,
        bot,
        settings,
        model,
        logger
      })
      let fArr = normalizeEnums({ forms: { [payload[TYPE]]: payload }, models })
      if (!forms[payload[TYPE]]) forms[payload[TYPE]] = payload
      allFormulas.forEach(async val => {
        let [propName, formula] = val
        let prop = model.properties[propName]
        try {
          let value = new Function('application', 'forms', `return ${formula}`)(application, forms)
          if (!value) return
          if (
            typeof value === 'string' &&
            prop.type === 'object' &&
            models[prop.ref].subClassOf === ENUM
          ) {
            let elm = models[prop.ref].enum.find(e => e.id === value)
            if (!elm) return
            value = {
              id: `${prop.ref}_${elm.id}`,
              title: elm.title
            }
          }
          application[propName] = value
        } catch (err) {
          // logger.debug('interFormConditionals: ', err)
          if (err.message.indexOf('Cannot read property') === -1)
            logger.debug(
              `interFormConditionals: please check formula ${formula} for ${payload[TYPE]}`,
              err
            )
          debugger
        }
      })
    },
    async willRequestForm({ application, formRequest }) {
      // debugger
      if (!application) return
      const requestFor = application.requestFor
      let productConf = conf[requestFor]
      if (!productConf) return

      let ftype = formRequest.form
      let model = bot.models[ftype]
      if (!model) return
      let formConditions = productConf.find(f => typeof f !== 'string' && f[ftype])

      if (!formConditions) return

      formConditions = formConditions[ftype]
      let settings
      if (Array.isArray(formConditions)) settings = formConditions.filter(f => isSet(f))
      else settings = isSet(formConditions) && [formConditions]

      if (!settings || !settings.length) return
      let { allForms, allFormulas = [], forms } = await getAllToExecute({
        application,
        bot,
        settings,
        model,
        logger
      })
      allFormulas.forEach(async val => {
        let [propName, formula] = val
        formula = normalizeFormula({ formula })
        try {
          let value = new Function('forms', 'application', `return ${formula}`)(forms, application)
          if (!formRequest.prefill) {
            formRequest.prefill = {
              [TYPE]: ftype,
              [propName]: value
            }
          } else formRequest.prefill[propName] = value
        } catch (err) {
          debugger
        }
      })
    }
  }
  return {
    plugin
  }
}
function isSet(value) {
  return value.startsWith('set: ')
}
function getForms(formula) {
  let forms = []
  let idx = 0
  let len = formula.length
  while (idx < len) {
    let idx1 = formula.indexOf("forms['", idx)
    if (idx1 === -1) break
    let idx2 = formula.indexOf("']", idx1)
    if (idx2 === -1) {
      debugger
      break
    }
    forms.push(formula.slice(idx1 + 7, idx2))
    idx = idx2 + 2
  }
  return forms
}
async function getAllToExecute({ bot, application, settings, model, logger }) {
  let allForms = []
  let allFormulas = []

  settings.forEach(async val => {
    let [propName, formula] = val
      .slice(5)
      .split('=')
      .map(s => s.trim())

    if (!model.properties[propName]) {
      debugger
      return
    }

    allFormulas.push([propName, formula])
    let formIds = getForms(formula)
    if (!formIds.length) return

    formIds.forEach(f => !allForms.includes(f) && allForms.push(f))
  })

  let promises = []
  application.forms
    .map(appSub => parseStub(appSub.submission))
    .forEach(f => {
      if (allForms.includes(f.type)) promises.push(bot.objects.get(f.link))
    })
  let forms = {}
  try {
    let result = await Promise.all(promises)
    result.forEach(r => (forms[r[TYPE]] = r))
  } catch (err) {
    logger.error('interFormConditionals', err)
  }

  return { allForms, allFormulas, forms }
}

function normalizeEnums({ forms, models }) {
  let newForms = {}
  for (let f in forms) {
    let originalForm = forms[f]
    let form = cloneDeep(originalForm)
    let model = models[form[TYPE]]
    let props = model.properties
    for (let p in form) {
      if (!props[p]) continue
      let { ref } = props[p]
      if (!ref || models[ref].subClassOf !== ENUM) continue
      form[p] = form[p].id.split('_')[1]
    }
    newForms[form[TYPE]] = form
  }
  return newForms
}

function normalizeFormula({ formula }) {
  return formula.replace(/\s=\s/g, ' === ').replace(/\s!=\s/g, ' !== ')
}

export const validateConf: ValidatePluginConf = async ({ bot, pluginConf }) => {
  const { models } = bot
  debugger
  for (let modelId in pluginConf) {
    if (!models[modelId]) throw new Error(`missing model: ${modelId}`)
    checkConf({ conf: pluginConf[modelId], modelId, models })
  }
}
const checkConf = ({ conf, modelId, models }) => {
  let settings
  if (Array.isArray(conf)) {
    settings = conf
  } else {
    for (let p in conf) {
      let settings = models[p]
      if (!settings && (p !== 'all' || modelId !== APPLICATION))
        throw new Error(`missing model: ${modelId}`)
      if (modelId === APPLICATION && p === 'all') continue
    }
  }
  if (!settings) return

  settings.forEach(formula => {
    if (typeof formula === 'object') {
      for (let p in formula) {
        if (!models[p]) throw new Error(`missing model: ${p}`)
        formula = formula[p]
      }
    } else if (!formula.startsWith('set:')) {
      if (!models[formula]) throw new Error(`missing model: ${formula}`)
      return
    }
    let forms = getForms(formula)
    if (!forms.length) return
    forms.forEach(f => {
      if (!models[f]) throw new Error(`missing model: ${f}`)
    })
  })
}
