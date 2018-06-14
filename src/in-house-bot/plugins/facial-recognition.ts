import _ from 'lodash'
import querystring from 'querystring'
import fetch from 'node-fetch'
import FormData from 'form-data';
import Embed from '@tradle/embed';
import buildResource from '@tradle/build-resource'
import constants from '@tradle/constants'
import { Bot, Logger, CreatePlugin, Applications, IPBApp, IPluginLifecycleMethods } from '../types'
import { getParsedFormStubs } from '../utils'

const { TYPE, TYPES } = constants
const { VERIFICATION } = TYPES
const SELFIE = 'tradle.Selfie'
const PHOTO_ID = 'tradle.PhotoID'
const FACIAL_RECOGNITION = 'tradle.FacialRecognitionCheck'

// all three should become parameters
const BASE_URL = 'http://localhost:8000'
const TOKEN = 'yb2e-hkPz'
const THRASHOLD = '0.75'

const DISPLAY_NAME = 'Face Recognition'
const PROVIDER = 'NTechlab'

export const name = 'facial-recognition'

type FacialRecognitionConf = {
  token: string
  url: string
  threshold: string
}

export class FacialRecognitionAPI {
  private bot:Bot
  private logger:Logger
  private applications: Applications
  private conf: FacialRecognitionConf
  constructor({ bot, applications, logger, conf }) {
    this.bot = bot
    this.applications = applications
    this.logger = logger
    this.conf = conf
  }

  public getSelfieAndPhotoID = async (application: IPBApp) => {
    const stubs = getParsedFormStubs(application)
    const photoIDStub = stubs.find(({ type }) => type === PHOTO_ID)
    const selfieStub = stubs.find(({ type }) => type === SELFIE)
    if (!(photoIDStub && selfieStub)) {
      // not enough info
      return
    }
    this.logger.debug('Face recognition both selfie and photoId ready');
    const tasks = [photoIDStub, selfieStub].map(async stub => {
      const object = await this.bot.getResource(stub)
      return this.bot.objects.presignEmbeddedMediaLinks({
        object,
        stripEmbedPrefix: true
      })
    })
    const [photoID, selfie] = await Promise.all(tasks)
    return { selfie, photoID }
  }

  public matchSelfieAndPhotoID = async ({ selfie, photoID, application }: {
    selfie: string
    photoID: string
    application: IPBApp
  }) => {
    let matchResult
    let error
    const models = this.bot.models
debugger
    // call whatever API with whatever params
    const form = new FormData();
    form.append('photo1', selfie);
    form.append('photo2', photoID);
    form.append('thrashold', this.conf.threshold);
    try {
      let res = await fetch(this.conf.url + '/v1/verify', { method: 'POST', body: form, headers: {'Authorization':'Token ' + this.conf.token}});
      matchResult = await res.json() // whatever is returned may be not JSON
      this.logger.debug('Face recognition check, match:', matchResult);
    } catch (err) {
      debugger
      error = `Check was not completed for "${buildResource.title({models, resource: photoID})}": ${err.message}`
      this.logger.error('Face recognition check', err)
      matchResult = { status: false, rawData: '{error : err.message}', error }
    }

    // interpet result and/or error
    // can return
    /*
    {
      "code": "NO_FACES",
      "param": "photo1",
      "reason": "No faces found on photo"
    }
    or 
    {
       "code": "BAD_IMAGE",
       "param": "photo1",
       "reason": "Image is too large (4032x3024)"
    }
    */
    // normal return
    /*
    {
      "results": [
      {
        "bbox1": {
          "x1": 72,
          "x2": 290,
          "y1": 269,
          "y2": 488
        },
        "bbox2": {
          "x1": 148,
          "x2": 401,
          "y1": 248,
          "y2": 502
        },
        "confidence": 0.5309136025607586,
        "verified": false
      }
    ],
    "verified": false
  }
  */


    if (matchResult.code) {
      // error happens
      error = `Check was not completed for "${buildResource.title({models, resource: photoID})}": ${matchResult.code}`
      this.logger.error('Face recognition check failed: ' + matchResult.param + '->' + matchResult.reason);
      return { status: false, rawData: matchResult, error }
    }


    return { status: matchResult.verified, rawData: matchResult, error }
  }

  public createCheck = async ({ status, selfie, photoID, rawData, application, error }) => {
    let models = this.bot.models
    let checkStatus, message
    let photoID_displayName = buildResource.title({models, resource: photoID})
    if (error) {
      checkStatus = 'fail'
      message = error
    }
    else if (status !== true) {
      checkStatus = 'fail'
      message = `Face recognition check for "${photoID_displayName}" failed`
    }
    else {
      checkStatus = 'pass'
      message = `Face recognition check for "${photoID_displayName}" passed`
    }
    const check = await this.bot.draft({ type: FACIAL_RECOGNITION })
      .set({
        status: checkStatus,
        message,
        provider: PROVIDER,
        rawData : rawData,
        application,
        dateChecked: new Date().getTime()
      })
      .signAndSave()

    return check.toJSON()
  }

  public createVerification = async ({ user, application, photoID }) => {
    const method:any = {
      [TYPE]: 'tradle.APIBasedVerificationMethod',
      api: {
        [TYPE]: 'tradle.API',
        name: DISPLAY_NAME
      },
      aspect: DISPLAY_NAME,
      reference: [{ queryId: 'n/a' }]
    }
debugger

    const verification = this.bot.draft({ type: VERIFICATION })
       .set({
         document: photoID,
         method
       })
       .toJSON()

    await this.applications.createVerification({ application, verification })
    if (application.checks)
      await this.applications.deactivateChecks({ application, type: FACIAL_RECOGNITION, form: photoID })
  }
}

const DEFAULT_CONF = {
  url : 'http://ec2-18-217-36-56.us-east-2.compute.amazonaws.com:8000',
  token : 'Z7dc-tCqj',
  threshold: 'strict'
}

export const createPlugin: CreatePlugin<FacialRecognitionAPI> = (components, pluginOpts) => {
  const { bot, applications } = components
  let { logger, conf=DEFAULT_CONF } = pluginOpts
  conf = _.defaults(conf, DEFAULT_CONF)
  const facialRecognition = new FacialRecognitionAPI({ bot, applications, logger, conf })
  const plugin:IPluginLifecycleMethods = {
    onFormsCollected: async ({ req, user, application }) => {
      if (req.skipChecks) return
      if (!application) return
      let productId = application.requestFor
      //let { products } = conf
      //if (!products  ||  !products[productId])
      //  return
debugger
      const result = await facialRecognition.getSelfieAndPhotoID(application)
      if (!result) return

      const { selfie, photoID } = result
      const { status, rawData, error } = await facialRecognition.matchSelfieAndPhotoID({
        selfie: selfie.selfie.url,
        photoID: photoID.scan.url,
        application
      })

      const promiseCheck = facialRecognition.createCheck({status, selfie, photoID, rawData, error, application})
      const pchecks = [promiseCheck]
      if (status === true) {
        const promiseVerification = facialRecognition.createVerification({user, application, photoID})
        pchecks.push(promiseVerification)
      }

      await Promise.all(pchecks)
    }
  }

  return {
    api: facialRecognition,
    plugin
  }
}

export const validateConf = ({ pluginConf }: {
  pluginConf: FacialRecognitionConf
}) => {
  if (typeof pluginConf.token !== 'string') throw new Error('expected "string" token')
  if (typeof pluginConf.url !== 'string') throw new Error('expected "string" url')
  if (typeof pluginConf.threshold !== 'undefined' && typeof pluginConf.threshold !== 'string') {
    throw new Error('expected "string" threshold')
  }
  if (pluginConf.threshold === 'strict') {
    // check the value to be 'strict','low','medium' or number 0 < x < 1 
  }
}
