import fetch from 'node-fetch'
import _ from 'lodash'

import { buildResourceStub } from '@tradle/build-resource'
import constants from '@tradle/constants'
import validateResource from '@tradle/validate-resource'
// @ts-ignore
const { sanitize } = validateResource.utils
import { Bot, Logger, IPBApp, IPBReq, ITradleObject, CreatePlugin, Applications } from '../types'

import { getCheckParameters, getStatusMessageForCheck, doesCheckNeedToBeCreated } from '../utils'

const { TYPE } = constants
const VERIFICATION = 'tradle.Verification'
const BASE_URL = 'https://api.complyadvantage.com/searches'
// const LEGAL_ENTITY = 'tradle.legal.LegalEntity'
const PHOTO_ID = 'tradle.PhotoID'
const PERSONAL_INFO = 'tradle.PersonalInfo'
const SANCTIONS_CHECK = 'tradle.SanctionsCheck'
let ASPECTS = 'screening: '

const PROVIDER = 'Comply Advantage'
const PERSON_FORMS = [PHOTO_ID, PERSONAL_INFO]

const isPersonForm = form => PERSON_FORMS.includes(form[TYPE])

const defaultPropMap: any = {
  companyName: 'companyName',
  registrationDate: 'registrationDate'
}
const defaultPersonPropMap: any = {
  firstName: 'firstName',
  lastName: 'lastName',
  dateOfBirth: 'dateOfBirth'
}
interface IComplyAdvantageCredentials {
  apiKey: string
}

interface IComplyAdvantageConf {
  search_term?: string
  fuzziness?: number
  filter?: IComplyAdvantageFilter
  entity_type?: string
  products: any
  credentials: IComplyAdvantageCredentials
  propertyMap: any
}
interface IComplyAdvantageFilter {
  types?: string[]
}
interface IComplyCheck {
  application: IPBApp
  rawData: any
  status: any
  form: ITradleObject
  req: IPBReq
  aspects: any
}

class ComplyAdvantageAPI {
  private bot: Bot
  private conf: IComplyAdvantageConf
  private productsAPI: any
  private logger: Logger
  private applications: Applications
  constructor({ bot, productsAPI, applications, conf, logger }) {
    this.bot = bot
    this.conf = conf
    this.productsAPI = productsAPI
    this.applications = applications
    this.logger = logger
  }

  public async getAndProcessData({ user, pConf, payload, propertyMap, application, req }) {
    let criteria = pConf.filter
    // let companyName, registrationDate
    // let resource = payload
    let map = pConf.propertyMap && pConf.propertyMap[payload[TYPE]]
    if (!map) map = propertyMap && propertyMap[payload[TYPE]]
    debugger
    let aspects
    let isPerson = (criteria && criteria.entity_type === 'person') || isPersonForm(payload)
    if (!criteria || !criteria.filter.types) aspects = ASPECTS + 'sanctions'
    else aspects = ASPECTS + criteria.filter.types.join(', ')
    // debugger
    // if (await doesCheckExist({bot: this.bot, type: SANCTIONS_CHECK, eq: {form: payload._link}, application, provider: PROVIDER}))
    //   return
    // Check that props that are used for checking changed
    let propertiesToCheck
    if (isPerson) propertiesToCheck = ['firstName', 'lastName', 'dateOfBirth']
    else propertiesToCheck = ['companyName', 'registrationDate']

    let createCheck = await doesCheckNeedToBeCreated({
      bot: this.bot,
      type: SANCTIONS_CHECK,
      application,
      provider: PROVIDER,
      form: payload,
      propertiesToCheck,
      prop: 'form'
    })
    if (!createCheck) return

    let defaultMap: any = (isPerson && defaultPersonPropMap) || defaultPropMap

    // Check if the check parameters changed
    let { resource, error } = await getCheckParameters({
      plugin: PROVIDER,
      resource: payload,
      bot: this.bot,
      defaultPropMap: defaultMap,
      map
    })
    if (!resource) {
      if (error) this.logger.debug(error)
      // HACK - check if there is a check for this provider
      if (application.checks && application.checks.find(c => c[TYPE] === payload[TYPE])) return
      resource = payload
    }
    let { companyName, registrationDate, firstName, lastName, dateOfBirth } = resource
    let name
    if (isPerson) {
      if (!firstName || !lastName || !dateOfBirth) {
        this.logger.debug(
          `${PROVIDER}. Not enough information to run the check for: ${payload[TYPE]}`
        )
        let status = {
          status: 'fail',
          message: !dateOfBirth && 'No date of birth was provided'
          // message: `Sanctions check for "${name}" failed.` + (!dateOfBirth  &&  ' No registration date was provided')
        }
        await this.createCheck({ application, rawData: {}, status, form: payload, req, aspects })
        return
      }
      if (firstName.length === 1 && lastName.length === 1) {
        this.logger.debug(`${PROVIDER}. Bad criteria: one letter first and last names`)
        let status = {
          status: 'fail',
          message: 'Bad criteria: one letter first and last names'
          // message: `Sanctions check for "${name}" failed.` + (!dateOfBirth  &&  ' No registration date was provided')
        }
        await this.createCheck({ application, rawData: {}, status, form: payload, req, aspects })
        return
      }
      name = firstName + ' ' + lastName
    } else {
      this.logger.debug(`${PROVIDER} for: ${companyName}`)

      if (!companyName || !registrationDate) {
        let props = this.bot.models[payload[TYPE]].properties
        if (
          props.companyName &&
          props.companyName.readOnly &&
          props.registrationDate &&
          props.registrationDate.readOnly
        )
          return
        this.logger.debug(
          `${PROVIDER}. Not enough information to run the check for: ${payload[TYPE]}`
        )
        let status = {
          status: 'fail',
          message: !registrationDate && ' No registration date was provided'
        }
        await this.createCheck({ application, rawData: {}, status, form: payload, req, aspects })
        return
      }
    }
    let r: { rawData: any; hits: any; status: any } = await this.getData(resource, criteria)

    let pchecks = []
    let { rawData, hits, status } = r
    if (rawData.status === 'failure') {
      pchecks.push(
        this.createCheck({ application, rawData, status: 'fail', form: payload, req, aspects })
      )
    } else {
      let hasVerification
      if (hits && hits.length)
        this.logger.debug(`${PROVIDER} found sanctions for: ${companyName || name}`)
      else {
        hasVerification = true
        this.logger.debug(`${PROVIDER} creating verification for: ${companyName || name}`)
      }
      pchecks.push(this.createCheck({ application, rawData, status, form: payload, req, aspects }))
      if (hasVerification)
        pchecks.push(this.createVerification({ user, application, form: payload, rawData }))
    }
    let checksAndVerifications = await Promise.all(pchecks)
  }

  public getData = async (resource, criteria) => {
    let { companyName, registrationDate, firstName, lastName, dateOfBirth, entity_type } = resource //conf.propertyMap //[resource[TYPE]]
    let search_term = criteria && criteria.search_term

    let isCompany = companyName && registrationDate
    let body: any
    if (isCompany) {
      body = {
        search_term: search_term || companyName,
        filters: {
          birth_year: new Date(registrationDate).getFullYear()
        }
      }
    } else {
      body = {
        search_term: {
          first_name: firstName,
          last_name: lastName
        },
        filters: {
          birth_year: new Date(dateOfBirth).getFullYear(),
          remove_deceased: '1'
        }
      }
    }
    _.merge(body, {
      share_url: 1,
      fuzziness: criteria.fuzziness || 0,
      filters: {
        types: (criteria && criteria.filter && criteria.filter.types) || ['sanction']
      }
    })
    body = JSON.stringify(body)

    let url = `${BASE_URL}?api_key=${this.conf.credentials.apiKey}`
    let json // = undetermined
    let message
    let status: any
    // if (!json) {
    try {
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      json = await res.json()
    } catch (err) {
      this.logger.debug(`${PROVIDER} something went wrong`, err)
      json = { status: 'failure', message: err.message }
      status = {
        status: 'error',
        message: err.message
      }

      return { status, rawData: {}, hits: [] }
    }
    let rawData = json && json.content.data
    let entityType = criteria.entity_type
    if (!entityType)
      entityType = (isCompany && ['company', 'organisation', 'organization']) || ['person']
    let hits = rawData.hits.filter(hit => entityType.includes(hit.doc.entity_type))
    // debugger
    rawData.hits = hits
    rawData = sanitize(rawData).sanitized
    if (hits && hits.length) {
      status = {
        status: 'fail'
      }
    } else {
      status = {
        status: 'pass'
      }
    }
    return hits && { rawData, status, hits }
  }

  public createCheck = async ({
    application,
    rawData,
    status,
    form,
    req,
    aspects
  }: IComplyCheck) => {
    let dateStr = rawData.updated_at
    let date
    if (dateStr) date = Date.parse(dateStr) - new Date().getTimezoneOffset() * 60 * 1000
    else date = new Date().getTime()
    // debugger
    let resource: any = {
      [TYPE]: SANCTIONS_CHECK,
      status: status.status,
      provider: PROVIDER,
      application,
      dateChecked: date, //rawData.updated_at ? new Date(rawData.updated_at).getTime() : new Date().getTime(),
      aspects,
      form
    }

    // resource.message = getStatusMessageForCheck({ models: this.bot.models, check: resource })
    if (status.status === 'fail' && rawData.hits) {
      let prefix = ''
      if (rawData.hits.length > 100) prefix = 'At least '
      resource.message = `${prefix}${rawData.hits.length} hits were found for this criteria`
    }
    if (status.message) resource.resultDetails = status.message
    if (rawData) {
      resource.rawData = rawData
      if (rawData.share_url) resource.shareUrl = rawData.share_url
      if (rawData.ref) resource.providerReferenceNumber = rawData.ref
    }

    this.logger.debug(`${PROVIDER} Creating SanctionsCheck for: ${rawData.submitted_term}`)
    await this.applications.createCheck(resource, req)
    // const check = await this.bot.signAndSave(resource)
    this.logger.debug(`${PROVIDER} Created SanctionsCheck for: ${rawData.submitted_term}`)
  }

  public createVerification = async ({ user, application, form, rawData }) => {
    const method: any = {
      [TYPE]: 'tradle.APIBasedVerificationMethod',
      api: {
        [TYPE]: 'tradle.API',
        name: 'Comply advantage'
      },
      aspect: 'sanctions check',
      reference: [{ queryId: 'report:' + rawData.id }],
      rawData
    }

    const verification = this.bot
      .draft({ type: VERIFICATION })
      .set({
        document: form,
        method
      })
      .toJSON()

    await this.applications.createVerification({ application, verification })
    if (application.checks)
      await this.applications.deactivateChecks({ application, type: SANCTIONS_CHECK, form })
  }
}
// {conf, bot, productsAPI, logger}
export const createPlugin: CreatePlugin<void> = (
  { bot, productsAPI, applications },
  { conf, logger }
) => {
  // const complyAdvantage = new ComplyAdvantageAPI({ bot, apiKey: conf.credentials.apiKey, productsAPI, logger })
  const complyAdvantage = new ComplyAdvantageAPI({ bot, productsAPI, applications, conf, logger })
  const plugin = {
    async onmessage(req: IPBReq) {
      if (req.skipChecks) return
      const { user, application, applicant, payload } = req

      if (!application) return

      let productId = application.requestFor
      let { products, forms } = conf
      let ptype = payload[TYPE]
      let pConf
      if (products && products[productId]) pConf = products[productId]
      else if (forms && forms[ptype]) {
        pConf = forms[ptype]
        await complyAdvantage.getAndProcessData({
          user,
          pConf,
          application,
          propertyMap: null,
          payload,
          req
        })
        return
      } else return

      let propertyMap = pConf.propertyMap[ptype]
      if (!isPersonForm(payload) && !propertyMap) return

      // if (!isPersonForm(payload) && payload[TYPE] !== LEGAL_ENTITY) return
      await complyAdvantage.getAndProcessData({
        user,
        pConf,
        application,
        propertyMap,
        payload,
        req
      })
    }
  }

  return {
    plugin
  }
}

// const success = {
//   "code": 200,
//   "status": "success",
//   "content": {
//     "data": {
//       "id": 35058571,
//       "ref": "1517629273-f6a9h7KG",
//       "searcher_id": 1441,
//       "assignee_id": 1441,
//       "filters": {
//         "types": [
//           "sanction"
//         ],
//         "birth_year": 2014,
//         "exact_match": false,
//         "fuzziness": 1
//       },
//       "match_status": "no_match",
//       "risk_level": "unknown",
//       "search_term": "Nordgregglee",
//       "submitted_term": "Nordgregglee",
//       "client_ref": null,
//       "total_hits": 0,
//       "updated_at": "2018-02-03 03:41:13",
//       "created_at": "2018-02-03 03:41:13",
//       "limit": 100,
//       "offset": 0,
//       "hits": []
//     }
//   }
// }
// const undetermined = {
//   "code":200,
//   "status":"success",
//   "content":{
//     "data":{
//       "id":34938499,
//       "ref":"1517504402-OvZRF6Cz",
//       "searcher_id":1441,"assignee_id":1441,
//       "filters":{
//         "types":["sanction"],
//         "birth_year":1970,
//         "exact_match":false,
//         "fuzziness":1
//       },
//       "match_status":"potential_match","risk_level":"unknown","search_term":"Some company",
//       "submitted_term":"Khanani","client_ref":null,
//       "total_hits":1,
//       "updated_at":"2018-02-01 17:00:02",
//       "created_at":"2018-02-01 17:00:02",
//       "limit":100,
//       "offset":0,
//       "hits":[
//         {
//         "doc": {
//           "aka":[{"name":"Some company MONEY LAUNDERING ORGANIZATION"}],
//           "entity_type":"company",
//           "fields":[
//             {"name":"Countries","tag":"country_names","value":"Australia"},
//             {"name":"OFAC ID","source":"ofac-sdn-list","value":"OFAC-18247"},
//             {"locale":"en","name":"Programs","source":"ofac-sdn-list","value":"* TCO: Transnational Criminal Organizations Sanctions Regulations, 31 C.F.R. part 590; Executive Order 13581"},
//             {"name":"Address","source":"ofac-sdn-list","value":"Australia"},
//             {"name":"Related URL",
//              "source":"ofac-sdn-list",
//              "tag":"related_url",
//              "value":"http:\/\/www.treasury.gov\/resource-center\/sanctions\/SDN-List\/Pages\/default.aspx"
//            }
//           ],
//           "id":"BFFHVUO8R0V5RJD",
//           "keywords":[],
//           "last_updated_utc":"2018-01-25T11:43:12Z",
//           "name":"Some company MONEY LAUNDERING ORGANIZATION",
//           "sources":["ofac-sdn-list"],
//           "types":["sanction"]
//         },
//         "match_types":["name_exact"],
//         "score":1.711}
//       ]
//     }
//   }
// }

// async getCheckParameters (resource) {
//   let map = this.conf.propertyMap[resource[TYPE]]
//   let dbRes = resource._prevlink  &&  await this.bot.objects.get(resource._prevlink)
//   let runCheck = !dbRes
//   debugger
//   let r:any = {}
//   for (let prop in defaultPropMap) {
//     let p = map  &&  map[prop]
//     if (!p)
//       p = prop
//     let pValue = resource[p]
//     if (dbRes  &&  dbRes[p] !== pValue)
//       runCheck = true
//     r[prop] = pValue
//   }
//   debugger
//   if (runCheck)
//     return r
//   this.logger.debug(`nothing changed for: ${title({resource, models: this.bot.models})}`)

//   // for (let formId in propertyMap) {
//   //   let map = propertyMap[formId]
//   //   if (formId !== LEGAL_ENTITY) {
//   //     debugger
//   //     let formStubs = getParsedFormStubs(application).filter(f => f.type === LEGAL_ENTITY)

//   //     if (!formStubs.length) {
//   //       this.logger.debug(`No form ${formId} was found for ${productId}`)
//   //       return
//   //     }
//   //     let { link } = formStubs[0]
//   //     resource = await this.bot.objects.get(link)
//   //   }
//   //   let companyNameProp = map.companyName
//   //   if (companyNameProp) {
//   //     companyName = resource[companyNameProp]
//   //     if (dbRes  &&  dbRes[companyNameProp] !== companyName)
//   //       runCheck = true
//   //   }
//   //   let registrationDateProp = map.registrationDate
//   //   if (registrationDateProp) {
//   //     registrationDate = resource[registrationDateProp]
//   //     if (dbRes  &&  dbRes[registrationDateProp] !== registrationDate)
//   //       runCheck = true
//   //   }
//   // }
//   // if (runCheck)
//   //   return {companyName, registrationDate}
//   // else
//   //   this.logger.debug(`nothing changed for: ${companyName}`)
// }
