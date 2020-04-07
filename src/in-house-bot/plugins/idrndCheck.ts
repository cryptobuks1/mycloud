// @ts-ignore
import FormData from 'form-data'
import DataURI from 'strong-data-uri'
import fs from 'fs'
import _ from 'lodash'
import { buildResourceStub } from '@tradle/build-resource'
import constants from '@tradle/constants'
import fetch from 'node-fetch'
import buildResource from '@tradle/build-resource'
import {
  Bot,
  Logger,
  IPBApp,
  IPBReq,
  ITradleObject,
  CreatePlugin,
  Applications,
  IPluginLifecycleMethods,
  ValidatePluginConf
} from '../types'

import {
  doesCheckNeedToBeCreated,
  getStatusMessageForCheck,
  ensureThirdPartyServiceConfigured,
  getThirdPartyServiceInfo
} from '../utils'

import { TYPE, PERMALINK, LINK } from '@tradle/constants'

import validateResource from '@tradle/validate-resource'
// @ts-ignore
const { sanitize } = validateResource.utils


const SELFIE = 'tradle.Selfie'
const SELFIE_SPOOF_PROOF_CHECK = 'tradle.SpoofProofSelfieCheck'
const ASPECTS = 'Selfie fraud detection'

const PROVIDER = 'ID R&D'
const REPEAT = 'REPEAT'

const REQUEST_TIMEOUT = 10000

const ERROR_CODES = [
  'FACE_TOO_CLOSE',
  'FACE_NOT_FOUND',
  'FACE_TOO_SMALL',
  'FACE_ANGLE_TOO_LARGE',
  'TOO_MANY_FACES'
]

interface IDLiveFaceCheck {
  application: IPBApp
  status: any
  form: ITradleObject
  req: IPBReq
}

type IDLiveFaceConf = {
  apiUrl?: string
  apiKey?: string
  locale?: string
}

export class IDLiveFaceCheckAPI {
  private bot: Bot
  private logger: Logger
  private conf: IDLiveFaceConf
  private applications: Applications
  private messageMap: any

  constructor({ bot, applications, conf, logger }) {
    this.bot = bot
    this.applications = applications
    this.logger = logger
    let locale = conf.locale ? conf.locale : 'en'
    const fileContents = fs.readFileSync('./idrndCheck_messages_' + locale + '.json', 'utf8')
    this.messageMap = JSON.parse(fileContents)
  }

  public selfieLiveness = async (form, application) => {
    const { apiKey, apiUrl } = this.conf
    let rawData: any
    let message: any

    const models = this.bot.models
    await this.bot.resolveEmbeds(form)
    let facemap = form.facemap.url
    let buf = DataURI.decode(facemap)

    const dataToUpload = new FormData()
    dataToUpload.append('facemap', buf, 'blob')
    const headers = {}
    if (apiKey) {
      _.extend(headers, { Authorization: apiKey })
    }
    try {
      const res = await fetch(apiUrl + '/liveness', dataToUpload, {
        headers,
        timeout: REQUEST_TIMEOUT
      })
      if (res.ok) {
        let json = await res.json()
        rawData = sanitize(json).sanitized
        this.logger.debug('idrndCheck Liveness selfie check:', JSON.stringify(rawData, null, 2))
      }
      else throw Error(res.statusText)
    } catch (err) {
      debugger
      message = `Check was not completed for "${buildResource.title({
        models,
        resource: facemap
      })}": ${err.message}`
      this.logger.error('idrndCheck Liveness selfie check error', err)
      return { status: 'fail', rawData: {}, message }
    }

    if (rawData.error_code) {
      this.logger.error('idrndCheck selfie liveness check error, repeat', rawData.error_code)
      // error happens
      return { status: 'repeat', rawData }
    }
    else if (rawData.probability < 0.5)
      return { status: 'fail', rawData, message: 'possibility of fraud' }

    return { status: 'pass', rawData, message: 'no fraud detected' }
  }

  public createCheck = async ({ application, status, form, req }: IDLiveFaceCheck) => {
    let resource: any = {
      [TYPE]: SELFIE_SPOOF_PROOF_CHECK,
      status: status.status,
      provider: PROVIDER,
      application,
      dateChecked: Date.now(),
      aspects: ASPECTS,
      livenessScore: 0,
      form
    }
    resource.message = getStatusMessageForCheck({ models: this.bot.models, check: resource })
    if (status.message) resource.resultDetails = status.message
    debugger
    if (status.rawData) {
      resource.rawData = status.rawData
      if (status.rawData.probability)
        resource.livenessScore = status.rawData.probability
    }
    this.logger.debug(`idrndCheck Creating ${PROVIDER} check for ${ASPECTS}`)
    await this.applications.createCheck(resource, req)
    this.logger.debug(`idrndCheck Created ${PROVIDER} check for ${ASPECTS}`)
  }
}

export const createPlugin: CreatePlugin<IDLiveFaceCheckAPI> = (components, pluginOpts) => {
  const { bot, applications } = components
  let { logger, conf = {} } = pluginOpts

  const documentChecker = new IDLiveFaceCheckAPI({
    bot, applications, conf: {
      ...getThirdPartyServiceInfo(components.conf, 'idrndliveface'),
      ...conf
    }, logger
  })

  const plugin: IPluginLifecycleMethods = {
    validateForm: async ({ req }) => {
      if (req.skipChecks) return
      const { application, payload, user } = req

      if (!application) return
      if (payload[TYPE] !== SELFIE)
        return
      logger.debug('idrndCheck called')
      // debugger
      let toCheck = await doesCheckNeedToBeCreated({
        bot,
        type: SELFIE_SPOOF_PROOF_CHECK,
        application,
        provider: PROVIDER,
        form: payload,
        propertiesToCheck: ['scan'],
        prop: 'form',
        req
      })
      if (!toCheck) {
        logger.debug(
          `${PROVIDER}: check already exists for ${application.applicantName}`
        )
        return
      }
      // debugger
      let status: any = await documentChecker.selfieLiveness(payload, application)

      if (status.repeat) {
        const payloadClone = _.cloneDeep(payload)
        payloadClone[PERMALINK] = payloadClone._permalink
        payloadClone[LINK] = payloadClone._link

        // debugger
        let formError: any = {
          req,
          user,
          application
        }

        let message = ''
        if (this.messageMap[status.rawData.error_code]) {
          message = this.messageMap[status.rawData.error_code] + '. '
        }

        formError.details = {
          prefill: payloadClone,
          message: `${message}${this.messageMap[REPEAT]}`
        }

        try {
          await applications.requestEdit(formError)
          return {
            message: 'no request edit',
            exit: true
          }
        } catch (err) {
          debugger
        }
      }

      await documentChecker.createCheck({ application, status, form: payload, req })
    }
  }
  return {
    plugin,
    api: documentChecker
  }
}

export const validateConf: ValidatePluginConf = async ({ conf }) => {
  ensureThirdPartyServiceConfigured(conf, 'idrndliveface')
}

