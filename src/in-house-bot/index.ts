import crypto from 'crypto'
import _ from 'lodash'
// @ts-ignore
import Promise from 'bluebird'
import { utils as dynamoUtils, createTable } from '@tradle/dynamodb'
import createProductsStrategy from '@tradle/bot-products'
import createEmployeeManager from '@tradle/bot-employee-manager'
import validateResource from '@tradle/validate-resource'
import mergeModels from '@tradle/merge-models'
import { TYPE } from '@tradle/constants'
// import { models as onfidoModels } from '@tradle/plugin-onfido'
import { createPlugin as setNamePlugin } from './plugins/set-name'
import { createPlugin as keepFreshPlugin } from './plugins/keep-fresh'
import { createPlugin as createPrefillPlugin } from './plugins/prefill-form'
import { createPlugin as createSmartPrefillPlugin } from './plugins/smart-prefill'
import { createPlugin as createLensPlugin } from './plugins/lens'
import { Onfido, createPlugin as createOnfidoPlugin, registerWebhook } from './plugins/onfido'
import { createPlugin as createSanctionsPlugin } from './plugins/complyAdvantage'
import { createPlugin as createOpenCorporatesPlugin } from './plugins/openCorporates'
import { createPlugin as createCentrixPlugin} from './plugins/centrix'
import { createPlugin as createDeploymentPlugin } from './plugins/deployment'
import { createPlugin as createHandSigPlugin } from './plugins/hand-sig'
import { createPlugin as createTsAndCsPlugin } from './plugins/ts-and-cs'
import {
  createPlugin as keepModelsFreshPlugin,
  sendModelsPackIfUpdated,
  createGetIdentifierFromReq,
  createModelsPackGetter
} from './plugins/keep-models-fresh'

import { Commander } from './commander'
import { createRemediation } from './remediation'
import { createPlugin as createRemediationPlugin } from './plugins/remediation'
import { createPlugin as createPrefillFromDraftPlugin } from './plugins/prefill-from-draft'
import { createPlugin as createWebhooksPlugin } from './plugins/webhooks'
import { haveAllChecksPassed, isPendingApplication } from './utils'
import {
  Bot,
  IBotComponents,
  DatedValue,
  IConf,
  Remediation,
  Deployment,
  IPluginOpts,
  IPluginLifecycleMethods
} from './types'

import Logger from '../logger'
import baseModels from '../models'
import Errors from '../errors'
import constants from '../constants'

const { MAX_DB_ITEM_SIZE } = constants
const { parseStub } = validateResource.utils
const BASE_MODELS_IDS = Object.keys(baseModels)
const DEFAULT_PRODUCTS = ['tradle.CurrentAccount']
const DONT_FORWARD_FROM_EMPLOYEE = [
  'tradle.Verification',
  'tradle.ApplicationApproval',
  'tradle.ApplicationDenial',
  'tradle.AssignRelationshipManager'
]

const EMPLOYEE_ONBOARDING = 'tradle.EmployeeOnboarding'
const PRODUCT_REQUEST = 'tradle.ProductRequest'
const ONFIDO_ENABLED = true
const DEPLOYMENT = 'tradle.cloud.Deployment'
const ALL_HIDDEN_PRODUCTS = [
  DEPLOYMENT,
  EMPLOYEE_ONBOARDING
]

const HIDDEN_PRODUCTS = {
  employee: [EMPLOYEE_ONBOARDING],
  customer: ALL_HIDDEN_PRODUCTS
}

// until the issue with concurrent modifications of user & application state is resolved
// then some handlers can migrate to 'messagestream'
const willHandleMessages = event => event === 'message'

export default function createProductsBot ({
  bot,
  logger,
  conf,
  event=''
}: {
  bot: Bot,
  logger: Logger,
  conf: IConf,
  event?: string
}):IBotComponents {
  const {
    enabled,
    plugins={},
    autoApprove,
    // autoVerify,
    approveAllEmployees,
    // queueSends,
    // graphqlRequiresAuth
  } = conf.bot.products

  logger.debug('setting up products strategy')

  const handleMessages = willHandleMessages(event)
  const mergeModelsOpts = { validate: bot.isTesting }
  const productsAPI = createProductsStrategy({
    logger: logger.sub('products'),
    bot,
    models: {
      all: mergeModels()
        .add(baseModels, { validate: false })
        // .add(models, mergeModelsOpts)
        // .add(ONFIDO_ENABLED ? onfidoModels.all : {}, mergeModelsOpts)
        .add(conf.modelsPack ? conf.modelsPack.models : {}, mergeModelsOpts)
        .get()
    },
    products: _.uniq(enabled.concat(ALL_HIDDEN_PRODUCTS)),
    validateModels: bot.isTesting,
    nullifyToDeleteProperty: true
    // queueSends: bot.env.TESTING ? true : queueSends
  })

  const send = (opts) => productsAPI.send(opts)
  const employeeManager = createEmployeeManager({
    logger: logger.sub('employees'),
    bot,
    productsAPI,
    approveAll: approveAllEmployees,
    wrapForEmployee: true,
    shouldForwardFromEmployee: ({ req }) =>
      !DONT_FORWARD_FROM_EMPLOYEE.includes(req.type),
    handleMessages
  })

  const commonPluginOpts = <IPluginOpts>{
    bot,
    productsAPI,
    employeeManager,
    orgConf: conf
  }

  // employeeManager.hasEmployees = () => Promise.resolve(true)

  // console.log('customer models', Object.keys(customerModels).join(', '))
  // console.log('employee models', Object.keys(employeeModels).join(', '))
  // console.log('base models', BASE_MODELS_IDS.join(', '))
  // console.log('all models', Object.keys(productsAPI.models.all).join(', '))

  // if (handleMessages) {
  //   productsAPI.install(bot)
  // } else {
  //   productsAPI.bot = bot
  //   productsAPI.emit('bot', bot)
  // }

  // const customerModel = bot.modelStore.models['tradle.products.Customer']
  // bot.db.setExclusive({
  //   model: customerModel,
  //   table: createTable({
  //     get models() {
  //       return bot.modelStore.models
  //     },
  //     objects: bot.objects,
  //     docClient: bot.aws.docClient,
  //     maxItemSize: MAX_DB_ITEM_SIZE,
  //     forbidScan: true,
  //     defaultReadOptions: {
  //       ConsistentRead: true
  //     },
  //     exclusive: true,
  //     model: customerModel,
  //     tableDefinition: dynamoUtils.toDynogelTableDefinition(bot.tables.Users.definition)
  //   })
  // })

  // const usersTable = bot.db.tables[customerModel.id]
  // const getUser = usersTable.get
  // usersTable.get = ({ _permalink }) => getUser({ id: _permalink })

  if (handleMessages) {
    bot.onmessage(productsAPI.onmessage)
  }

  const myIdentityPromise = bot.getMyIdentity()
  const components = {
    bot,
    conf,
    productsAPI,
    employeeManager,
    get models() {
      return bot.modelStore.models
    }
  } as IBotComponents

  if (handleMessages) {
    productsAPI.plugins.use(<IPluginLifecycleMethods>{
      willRequestForm: ({ user, formRequest }) => {
        if (formRequest.form === PRODUCT_REQUEST) {
          const hidden = employeeManager.isEmployee(user) ? HIDDEN_PRODUCTS.employee : HIDDEN_PRODUCTS.customer
          formRequest.chooser.oneOf = formRequest.chooser.oneOf
            .filter(product => {
              // allow showing hidden products explicitly by listing them in conf
              // e.g. Tradle might want to list MyCloud, but for others it'll be invisible
              return enabled.includes(product) || !hidden.includes(product)
            })
        }
      }
    })

    productsAPI.removeDefaultHandler('onCommand')
    const getModelsPackForUser = createModelsPackGetter({ bot, productsAPI, employeeManager })
    const keepModelsFresh = keepModelsFreshPlugin({
      getIdentifier: createGetIdentifierFromReq({ employeeManager }),
      getModelsPackForUser,
      send
    })

    const bizPlugins = require('@tradle/biz-plugins')
    bizPlugins.forEach(plugin => productsAPI.plugins.use(plugin({
      bot,
      get models() {
        return bot.modelStore.models
      },
      productsAPI
    }), true)) // prepend

    if (plugins.termsAndConditions &&
      plugins.termsAndConditions.enabled &&
      conf.termsAndConditions) {
      const tcPlugin = createTsAndCsPlugin({
        termsAndConditions: conf.termsAndConditions,
        productsAPI,
        employeeManager,
        get remediation() {
          return components.remediation
        },
        logger: logger.sub('plugin-ts-and-cs')
      })

      productsAPI.plugins.use(tcPlugin, true) // prepend
    }

    if (conf.style) {
      const keepStylesFresh = keepFreshPlugin({
        object: conf.style,
        propertyName: 'stylesHash',
        send
      })

      productsAPI.plugins.use({ onmessage: keepStylesFresh }, true) // prepend
    }

    productsAPI.plugins.use({ onmessage: keepModelsFresh }, true) // prepend
    productsAPI.plugins.use({
      // 'onmessage:tradle.Form': async (req) => {
      //   let { type, application } = req
      //   if (type === 'tradle.ProductRequest') {
      //     debug(`deferring to default handler for ${type}`)
      //     return
      //   }

      //   if (!autoVerify) {
      //     debug(`not auto-verifying ${type}`)
      //     return
      //   }

      //   if (application && application.requestFor === DEPLOYMENT) {
      //     debug(`not autoverifying MyCloud config form: ${type}`)
      //     return
      //   }

      //   if (!application) {
      //     // normal for tradle.AssignRelationshipManager
      //     // because the user is the employee, but the application is the customer's
      //     debug(`not auto-verifying ${type} (unknown application)`)
      //     return
      //   }

      //   debug(`auto-verifying ${type}`)
      //   await productsAPI.verify({
      //     req,
      //     application,
      //     send: false,
      //     verification: {
      //       [TYPE]: 'tradle.Verification',
      //       method: {
      //         aspect: 'validity',
      //         reference: [{
      //           queryId: crypto.randomBytes(8).toString('hex')
      //         }],
      //         [TYPE]: 'tradle.APIBasedVerificationMethod',
      //         api: {
      //           [TYPE]: 'tradle.API',
      //           name: 'tradle-internal'
      //         }
      //       }
      //     }
      //   })
      // },
      'onmessage:tradle.SimpleMessage': async (req) => {
        const { user, application, object } = req
        const { message } = object
        bot.debug(`processing simple message: ${message}`)
        if (message[0] === '/') return
        if (application &&
          application.relationshipManagers &&
          application.relationshipManagers.length) return

        const lowercase = message.toLowerCase()
        if (/^hey|hi|hello$/.test(message)) {
          await send({
            req,
            to: user,
            object: {
              [TYPE]: 'tradle.SimpleMessage',
              message: `${message} yourself!`
            }
          })
        }
      },
      onFormsCollected: async ({ req, user, application }) => {
        if (application.draft) return

        if (!isPendingApplication({ user, application })) return

        if (!autoApprove) {
          const results = await Promise.all([
            haveAllChecksPassed({ bot, application }),
            productsAPI.haveAllSubmittedFormsBeenVerified({ application })
          ])

          const [mostRecentChecksPassed, formsHaveBeenVerified] = results
          if (!mostRecentChecksPassed) {
            logger.debug('not all checks passed, not approving')
          }

          if (!formsHaveBeenVerified) {
            logger.debug('not all forms have been verified, not approving')
          }

          if (!results.every(_.identity)) return
        }

        const approved = productsAPI.state.hasApplication({
          applications: user.applicationsApproved || [],
          application
        })

        if (!approved) {
          await productsAPI.approveApplication({ req, user, application })
          // verify unverified
          await productsAPI.issueVerifications({
            req, user, application, send: true
          })
        }
      },
      onCommand: async ({ req, command }) => {
        await components.commands.exec({ req, command })
      },
      didApproveApplication: async ({ req, user, application, judge }) => {
        if (judge) {
          await productsAPI.issueVerifications({ req, user, application, send: true })
        }

        if (application.requestFor === EMPLOYEE_ONBOARDING) {
          const modelsPack = await getModelsPackForUser(user)
          if (modelsPack) {
            await sendModelsPackIfUpdated({
              user,
              modelsPack,
              send: object => send({ req, to: user, application, object })
            })
          }
        }
      }
    }) // append

    productsAPI.plugins.use(setNamePlugin({ bot, productsAPI }))
    productsAPI.plugins.use(<IPluginLifecycleMethods>{
      onmessage: async (req) => {
        if (req.application && req.application.draft) {
          req.skipChecks = true
        }
      },
      ['onmessage:tradle.ProductRequest']: async (req) => {
        const { application } = req
        if (!application) return

        if (req.message.forward) return

        req.isFromEmployee = employeeManager.isEmployee(req.user)
        if (!req.isFromEmployee) return

        // HACK
        if (application.requestFor === DEPLOYMENT) return

        logger.debug('setting application.draft, as this is an employee applying on behalf of a customer')
        application.draft = true
        req.skipChecks = true
        await productsAPI.sendSimpleMessage({
          req,
          to: req.user,
          message: `Note: this is a draft application. When you finish you will be given a set of links that can be used to import`
        })
      }
    })

    // this is pretty bad...
    // the goal: allow employees to create multiple pending applications for the same product
    // as they are actually drafts of customer applications
    // however, for non-employees, possibly restrict to one pending app for the same product (default behavior of bot-products)
    const defaultHandlers = [].concat(productsAPI.removeDefaultHandler('onPendingApplicationCollision'))
    productsAPI.plugins.use(<IPluginLifecycleMethods>{
      onPendingApplicationCollision: async (input) => {
        const { req, pending } = input
        if (employeeManager.isEmployee(req.user)) {
          // allow it
          await productsAPI.addApplication({ req })
          return
        }

        await Promise.each(defaultHandlers, handler => handler(input))
      }
    }, true) // prepend
  }

  const onfidoConf = plugins.onfido || {}
  const willUseOnfido = ONFIDO_ENABLED &&
    onfidoConf.apiKey &&
    (handleMessages || /onfido/.test(event))

  if (willUseOnfido) {
    logger.debug('using plugin: onfido')
    const result = createOnfidoPlugin({
      ...commonPluginOpts,
      logger: logger.sub('onfido'),
      conf: onfidoConf
    })

    productsAPI.plugins.use(result.plugin)
    components.onfido = result.api
  }

  const customizeMessageOpts = plugins['customize-message']
  if (customizeMessageOpts) {
    logger.debug('using plugin: customize-message')
    const customizeMessage = require('@tradle/plugin-customize-message')
    productsAPI.plugins.use(customizeMessage({
      get models() {
        return bot.modelStore.models
      },
      conf: customizeMessageOpts,
      logger
    }))
  }

  if (plugins['prefill-form']) {
    logger.debug('using plugin: prefill-form')
    productsAPI.plugins.use(createPrefillPlugin({
      ...commonPluginOpts,
      conf: plugins['prefill-form'],
      logger: logger.sub('plugin-prefill-form')
    }).plugin)
  }

  if (plugins['smart-prefill']) {
    logger.debug('using plugin: smart-prefill')
    productsAPI.plugins.use(createSmartPrefillPlugin({
      ...commonPluginOpts,
      conf: plugins['smart-prefill'],
      logger: logger.sub('plugin-smart-prefill')
    }))
  }

  if (plugins['lens']) {
    logger.debug('using plugin: lens')
    productsAPI.plugins.use(createLensPlugin({
      ...commonPluginOpts,
      conf: plugins['lens'],
      logger: logger.sub('plugin-lens')
    }))
  }

  if (handleMessages) {
    if (plugins['openCorporates']) {
      productsAPI.plugins.use(createOpenCorporatesPlugin({
        ...commonPluginOpts,
        conf: plugins['openCorporates'],
        logger: logger.sub('plugin-opencorporates')
      }))
    }

    if (plugins['complyAdvantage']) {
      logger.debug('using plugin: complyAdvantage')
      productsAPI.plugins.use(createSanctionsPlugin({
        ...commonPluginOpts,
        conf: plugins['complyAdvantage'],
        logger: logger.sub('plugin-complyAdvantage')
      }))
    }

    if (plugins['centrix']) {
      productsAPI.plugins.use(createCentrixPlugin({
        ...commonPluginOpts,
        conf: plugins['centrix'],
        logger: logger.sub('plugin-centrix')
      }))
    }

    if (plugins['hand-sig']) {
      const result = createHandSigPlugin({
        ...commonPluginOpts,
        conf: plugins['hand-sig'],
        logger: logger.sub('plugin-hand-sig')
      })
    }
  }

  if (handleMessages || event.startsWith('deployment:')) {
    if (plugins['deployment']) {
      const result = createDeploymentPlugin({
        ...commonPluginOpts,
        conf: plugins['deployment'],
        logger: logger.sub('plugin-deployment')
      })

      components.deployment = result.deployment
      productsAPI.plugins.use(result.plugin)
    }
  }

  if (handleMessages || event.startsWith('remediation:')) {
    const { api, plugin } = createRemediationPlugin({
      ...commonPluginOpts,
      logger: logger.sub('remediation:')
    })

    if (handleMessages) {
      productsAPI.plugins.use(plugin)
    }

    components.remediation = api

    productsAPI.plugins.use(createPrefillFromDraftPlugin({
      ...commonPluginOpts,
      remediation: api,
      logger: logger.sub('plugin-prefill-from-draft:')
    }).plugin)
  }

  if (handleMessages) {
    components.commands = new Commander({
      ...components,
      logger: logger.sub('commander')
    })
  }

  if (plugins.webhooks) {
    if ((bot.isTesting && handleMessages) ||
      event === 'messagestream' ||
      event === 'resourcestream') {
      const { api, plugin } = createWebhooksPlugin({
        ...commonPluginOpts,
        conf: plugins.webhooks,
        logger: logger.sub('webhooks')
      })
    }
  }

  return components
}

export { createProductsBot }
