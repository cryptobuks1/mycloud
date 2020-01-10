import uniqBy from 'lodash/uniqBy'
import extend from 'lodash/extend'
import size from 'lodash/size'

import { Bot, Logger, CreatePlugin, IPluginLifecycleMethods, ITradleObject } from '../types'

import { TYPE } from '../../constants'
import validateResource from '@tradle/validate-resource'
import { enumValue } from '@tradle/build-resource'
import { regions } from '@tradle/aws-s3-client'
// @ts-ignore
const { sanitize } = validateResource.utils

const CORPORATION_EXISTS = 'tradle.CorporationExistsCheck'
const BENEFICIAL_OWNER_CHECK = 'tradle.BeneficialOwnerCheck'
const CLIENT_ACTION_REQUIRED_CHECK = 'tradle.ClientActionRequiredCheck'
const REFERENCE_DATA_SOURCES = 'tradle.ReferenceDataSources'
const CONTROLLING_PERSON = 'tradle.legal.LegalEntityControllingPerson'
const CHECK_STATUS = 'tradle.Status'
const COUNTRY = 'tradle.Country'
const COMPANIES_HOUSE = 'Companies House'

const countryMap = {
  England: 'United Kingdom',
  'England And Wales': 'United Kingdom'
}

export const createPlugin: CreatePlugin<void> = (components, pluginOpts) => {
  let { bot } = components
  let { logger } = pluginOpts
  const plugin: IPluginLifecycleMethods = {
    async willRequestForm({ application, formRequest }) {
      let { form } = formRequest
      if (form !== CONTROLLING_PERSON) return

      // debugger
      if (!application) return

      let { checks } = application
      if (!checks) return

      let stubs = checks.filter(
        check =>
          check[TYPE] === CORPORATION_EXISTS ||
          check[TYPE] === BENEFICIAL_OWNER_CHECK ||
          check[TYPE] === CLIENT_ACTION_REQUIRED_CHECK
      )
      if (!stubs.length) return
      logger.debug('found ' + stubs.length + ' checks')
      let result = await Promise.all(stubs.map(check => bot.getResource(check)))

      result.sort((a, b) => b._time - a._time)

      result = uniqBy(result, r => r[TYPE] && r.provider)
      let check = result.find(c => c[TYPE] === CORPORATION_EXISTS)
      let pscCheck = result.find(
        c =>
          c[TYPE] === BENEFICIAL_OWNER_CHECK &&
          c.provider === 'http://download.companieshouse.gov.uk/en_pscdata.html'
      )
      let carCheck = result.find(c => c[TYPE] === CLIENT_ACTION_REQUIRED_CHECK)

      let forms = application.forms.filter(form => form.submission[TYPE] === CONTROLLING_PERSON)
      let officers, items
      if (check.status.id !== `${CHECK_STATUS}_pass`) {
        if (pscCheck && pscCheck.status.id === `${CHECK_STATUS}_pass`)
          await this.prefillBeneficialOwner({ items, forms, officers, formRequest, pscCheck })
        if (carCheck && carCheck.status.id === `${CHECK_STATUS}_pass`)
          await this.prefillBeneficialOwner({
            items,
            forms,
            officers,
            formRequest,
            pscCheck: carCheck
          })

        return
      }

      officers =
        check.rawData &&
        check.rawData.length &&
        check.rawData[0].company &&
        check.rawData[0].company.officers

      if (officers.length)
        officers = officers.filter(o => o.officer.position !== 'agent' && !o.officer.inactive)

      let officer
      if (!forms.length) {
        officer = officers.length && officers[0].officer
      } else {
        items = await Promise.all(forms.map(f => bot.getResource(f.submission)))
        if (items.length) {
          for (let i = 0; i < officers.length && !officer; i++) {
            let o = officers[i].officer
            // if (o.inactive) continue
            let oldOfficer = items.find(item => {
              let oname = o.name.toLowerCase().trim()
              let iname = item.name && item.name.toLowerCase().trim()
              let pname = item.prefilledName && item.prefilledName.toLowerCase().trim()
              return oname === iname || oname === pname
            })
            // debugger
            if (!oldOfficer) officer = o
          }
        }
      }
      if (!officer) {
        if (pscCheck && pscCheck.status.id === `${CHECK_STATUS}_pass`) {
          let currenPrefill = { ...formRequest.prefill }
          await this.prefillBeneficialOwner({ items, forms, officers, formRequest, pscCheck })
          this.addRefDataSource({ dataSource: 'psc', formRequest, currenPrefill })
        } else if (carCheck && carCheck.status.id === `${CHECK_STATUS}_pass`) {
          // let currenPrefill = formRequest.prefill
          await this.prefillBeneficialOwner({
            items,
            forms,
            officers,
            formRequest,
            pscCheck: carCheck
          })
          // this.addRefDataSource({ dataSource: 'clientAction', formRequest, currenPrefill })
        }
        return
      }
      let { name, inactive, start_date, end_date, occupation, position } = officer
      let prefill: any = {
        name,
        prefilledName: name,
        startDate: start_date && new Date(start_date).getTime(),
        inactive,
        occupation,
        position,
        endDate: end_date && new Date(end_date).getTime()
      }
      if (check.provider === COMPANIES_HOUSE) {
        let [lastName, otherNames] = name.split(', ')
        if (otherNames) {
          let names = otherNames && otherNames.trim().split(' ')
          let firstName
          let middleName
          let len = names.length
          if (len !== 1) {
            middleName = names[len - 1]
            firstName = names
              .slice(0, len - 1)
              .join(' ')
              .trim()
          } else firstName = names[0].trim()

          extend(prefill, { firstName, lastName, middleName })
        }
      }
      // prefill = sanitize(prefill).sanitized
      let cePrefill = { ...prefill }
      let provider = enumValue({
        model: bot.models[REFERENCE_DATA_SOURCES],
        // HACK
        value: (check.provider === 'Open Corporates' && 'openCorporates') || 'companiesHouse'
      })

      let dataLineage = {
        [provider.id]: {
          properties: Object.keys(cePrefill)
        }
      }
      this.findAndPrefillBeneficialOwner(pscCheck, officer, prefill)
      prefill = sanitize(prefill).sanitized
      if (size(prefill) !== size(cePrefill)) {
        let pscPrefill = []
        for (let p in prefill) {
          if (!cePrefill[p]) pscPrefill.push(p)
        }
        let pscProvider = enumValue({
          model: bot.models[REFERENCE_DATA_SOURCES],
          value: 'psc'
        })
        dataLineage = {
          ...dataLineage,
          [pscProvider.id]: {
            properties: pscPrefill
          }
        }
      }
      formRequest.dataLineage = dataLineage
      if (!formRequest.prefill) formRequest.prefill = { [TYPE]: CONTROLLING_PERSON }
      formRequest.prefill = {
        ...formRequest.prefill,
        ...prefill,
        typeOfControllingEntity: {
          id: 'tradle.legal.TypeOfControllingEntity_person'
        }
      }
      formRequest.message = `Please review and correct the data below **for ${officer.name}**` //${bot.models[CONTROLLING_PERSON].title}: ${officer.name}`
    },
    addRefDataSource({ dataSource, currenPrefill, formRequest }) {
      let { prefill } = formRequest
      if (size(prefill) === size(currenPrefill)) return
      let dsPrefill = []
      for (let p in prefill) if (!currenPrefill[p]) dsPrefill.push(p)

      let eVal = enumValue({
        model: bot.models[REFERENCE_DATA_SOURCES],
        value: dataSource
      })
      if (!formRequest.dataLineage) formRequest.dataLineage = {}
      formRequest.dataLineage = {
        ...formRequest.dataLineage,
        [eVal.id]: {
          properties: dsPrefill
        }
      }
    },
    findAndPrefillBeneficialOwner(pscCheck, officer, prefill) {
      let beneficialOwners = pscCheck && pscCheck.rawData
      if (!beneficialOwners || !beneficialOwners.length) return
      if (beneficialOwners.length > 1) {
        // debugger
        beneficialOwners.sort(
          (a, b) => new Date(b.data.notified_on).getTime() - new Date(a.data.notified_on).getTime()
        )
        beneficialOwners = uniqBy(beneficialOwners, 'data.name')
      }
      let bo = beneficialOwners.find(bo => this.compare(officer.name, bo))
      if (!bo) return
      this.prefillIndividual(prefill, bo)
    },

    compare(officerName, bo) {
      officerName = officerName
        .replace(/[^a-zA-Z ]/g, '')
        .toLowerCase()
        .trim()
      let officerNameDetails = officerName.split(' ')

      let { name, name_elements } = bo.data
      if (!name && !name_elements) return false
      if (name_elements) {
        let nameElms: any = {}
        for (let p in name_elements) nameElms[p] = name_elements[p].toLowerCase()
        let { forename, surname, middle_name } = nameElms
        if (
          !officerNameDetails.includes(`${forename}`) ||
          !officerNameDetails.includes(`${surname}`) ||
          (middle_name && !officerNameDetails.includes(`${middle_name}`))
        )
          return false
        else return true
      }
      name = name.toLowerCase().trim()
      let idx = name.indexOf(officerName)
      if (idx !== -1) {
        if (name.length === officerName.length) return true
        if (idx && name.charAt(idx - 1) === ' ' && idx + officerName.length === name.length)
          return true
      }
    },
    prefillIndividual(prefill, bo) {
      let { country_of_residence, date_of_birth, natures_of_control, name_elements } = bo.data

      prefill.controllingEntityDateOfBirth =
        date_of_birth && new Date(date_of_birth.year, date_of_birth.month - 1).getTime()
      if (country_of_residence) {
        let country = getCountryByTitle(country_of_residence, bot.models)
        if (country) prefill.controllingEntityCountryOfResidence = country
      }
      if (name_elements) {
        let { firstName, lastName } = prefill
        if (!firstName && !lastName) {
          extend(prefill, {
            firstName: name_elements.forename,
            lastName: name_elements.surname,
            middleName: name_elements.middle_name
          })
        }
      }
      this.addNatureOfControl(prefill, natures_of_control)
    },
    prefillCompany(prefill, bo) {
      let { address, identification, position, occupation, natures_of_control } = bo.data

      prefill.occupation = occupation || position
      if (address) {
        let { country, locality, postal_code, address_line_1 } = address
        if (country) {
          country = getCountryByTitle(country, bot.models)
          if (country) prefill.controllingEntityCountry = country
        }
        extend(prefill, {
          controllingEntityPostalCode: postal_code,
          controllingEntityStreetAddress: address_line_1,
          // controllingEntityRegion: regions,
          controllingEntityCity: locality
        })
      }
      if (identification) {
        let {
          registration_number,
          legal_authority,
          legal_form,
          country_registered,
          place_registered
        } = identification
        extend(prefill, {
          controllingEntityCompanyNumber: registration_number,
          companyType: legal_form
        })
      }
      this.addNatureOfControl(prefill, natures_of_control)
    },
    addNatureOfControl(prefill, natures_of_control) {
      if (!natures_of_control) return
      let natureOfControl = bot.models['tradle.PercentageOfOwnership'].enum.find(e =>
        natures_of_control.includes(e.title.toLowerCase().replace(/\s/g, '-'))
      )
      if (natureOfControl)
        prefill.natureOfControl = {
          id: `tradle.PercentageOfOwnership_${natureOfControl.id}`,
          title: natureOfControl.title
        }
    },
    async prefillBeneficialOwner({ items, forms, officers, formRequest, pscCheck }) {
      if (!items) items = await Promise.all(forms.map(f => bot.getResource(f.submission)))
      if (!pscCheck) return

      if (pscCheck.status.id !== `${CHECK_STATUS}_pass`) return
      let beneficialOwners = pscCheck.rawData && pscCheck.rawData
      logger.debug(
        'pscCheck.rawData: ' +
          beneficialOwners +
          '; ' +
          JSON.stringify(beneficialOwners[0], null, 2) +
          '; length = ' +
          beneficialOwners.length
      )

      if (!beneficialOwners || !beneficialOwners.length) return

      if (beneficialOwners.length > 1) {
        // debugger
        beneficialOwners.sort(
          (a, b) => new Date(b.data.notified_on).getTime() - new Date(a.data.notified_on).getTime()
        )
        beneficialOwners = uniqBy(beneficialOwners, 'data.name')
      }
      for (let i = 0; i < beneficialOwners.length; i++) {
        let bene = beneficialOwners[i]
        let { data } = bene
        let { name, kind, ceased_on } = data
        if (ceased_on) continue
        // debugger
        logger.debug('name = ' + name)

        if (items.find(item => item.name === name || item.prefilledName === name)) continue

        let isIndividual = kind.startsWith('individual')
        if (isIndividual) {
          // const prefixes = ['mr', 'ms', 'dr', 'mrs', ]
          if (officers && officers.length) {
            let boName = name.toLowerCase().trim()
            if (officers.find(o => this.compare(o.officer.name, bene))) continue
          }
        } else if (!kind.startsWith('corporate-')) return
        let prefill: any = {
          name,
          prefilledName: name
        }
        if (isIndividual) {
          this.prefillIndividual(prefill, bene)
          // prefill.dateOfBirth =
          //   date_of_birth && new Date(date_of_birth.year, date_of_birth.month).getTime()
          // if (country_of_residence) {
          //   let country = getCountryByTitle(country_of_residence, bot.models)
          //   if (country) prefill.controllingEntityCountry = country
          // }
        } else {
          this.prefillCompany(prefill, bene)
          if (formRequest.prefill) prefill.owns = formRequest.prefill.legalEntity
        }
        prefill = sanitize(prefill).sanitized
        if (!formRequest.prefill) formRequest.prefill = { [TYPE]: CONTROLLING_PERSON }
        formRequest.prefill = {
          ...formRequest.prefill,
          ...prefill,
          typeOfControllingEntity: {
            id: kind.startsWith('individual')
              ? 'tradle.legal.TypeOfControllingEntity_person'
              : 'tradle.legal.TypeOfControllingEntity_legalEntity'
          }
        }
        logger.debug('prefill = ' + formRequest.prefill)
        formRequest.message = `Please review and correct the data below **for ${name}**` //${bot.models[CONTROLLING_PERSON].title}: ${officer.name}`
        return true
      }
    }
  }

  return {
    plugin
  }
}
function getCountryByTitle(country, models) {
  let mapCountry = countryMap[country]
  if (mapCountry) country = mapCountry
  let countryR = models[COUNTRY].enum.find(val => val.title === country)
  return (
    countryR && {
      id: `${COUNTRY}_${countryR.id}`,
      title: country
    }
  )
}
// const beneTest = [
//   {
//     company_number: '06415759',
//     data: {
//       address: {
//         address_line_1: '1 Goose Green',
//         country: 'England',
//         locality: 'Altrincham',
//         postal_code: 'WA14 1DW',
//         premises: 'Corpacq House'
//       },
//       etag: 'e5e6a05c5484ce25fca9884bb833d47c1fb1e0b4',
//       identification: {
//         country_registered: 'England',
//         legal_authority: 'Companies Act 2006',
//         legal_form: 'Private Company Limited By Shares',
//         place_registered: 'Register Of Companies For England And Wales',
//         registration_number: '11090838'
//       },
//       kind: 'corporate-entity-person-with-significant-control',
//       links: {
//         self:
//           '/company/06415759/persons-with-significant-control/corporate-entity/c3JdMtrhD9Z17jLydOWsp6YVh9w'
//       },
//       name: 'Beyondnewcol Limited',
//       natures_of_control: [
//         'ownership-of-shares-75-to-100-percent',
//         'voting-rights-75-to-100-percent',
//         'right-to-appoint-and-remove-directors'
//       ],
//       notified_on: '2019-06-27'
//     }
//   },
//   {
//     company_number: '12134701',
//     data: {
//       address: {
//         address_line_1: 'Bell Yard',
//         country: 'United Kingdom',
//         locality: 'London',
//         postal_code: 'WC2A 2JR',
//         premises: '7'
//       },
//       country_of_residence: 'United Kingdom',
//       date_of_birth: {
//         month: 3,
//         year: 1966
//       },
//       etag: 'a46e27e4284b75c2a6a2b6a122df6b1abee4e13d',
//       kind: 'individual-person-with-significant-control',
//       links: {
//         self:
//           '/company/12134701/persons-with-significant-control/individual/fXEREOeTBLPNqrAK3ylzPr3w73Q'
//       },
//       name: 'Miss Joana Castellet',
//       name_elements: {
//         forename: 'Joana',
//         surname: 'Castellet',
//         title: 'Miss'
//       },
//       nationality: 'Spanish',
//       natures_of_control: [
//         'ownership-of-shares-75-to-100-percent',
//         'voting-rights-75-to-100-percent',
//         'right-to-appoint-and-remove-directors'
//       ],
//       notified_on: '2019-08-01'
//     }
//   }
// ]
