import validateResource = require('@tradle/validate-resource')
import { PUBLIC_CONF_KEY, PRIVATE_CONF_KEY } from './constants'

export class Conf {
  public privateConfBucket: any
  public publicConfBucket: any
  public privateConf: any
  public publicConf: any
  constructor({ tradle }) {
    this.tradle = tradle
    this.privateConfBucket = tradle.buckets.PrivateConf
    this.publicConfBucket = tradle.buckets.PublicConf
    this.privateConf = this.privateConfBucket.getCacheable({
      key: PRIVATE_CONF_KEY,
      ttl: 60000,
      parse: JSON.parse.bind(JSON)
    })

    this.publicConf = this.publicConfBucket.getCacheable({
      key: PUBLIC_CONF_KEY,
      ttl: 60000,
      parse: JSON.parse.bind(JSON)
    })
  }

  public getPrivateConf = () => this.privateConf.get()
  public getPublicConf = () => this.publicConf.get()

  public savePublicConf = (value) => {
    return this.publicConf.put({ value })
  }

  public savePrivateConf = (value) => {
    return this.privateConf.put({ value })
  }

  public setStyle = async (style) => {
    validateResource({
      models: tradle.models,
      model: 'tradle.StylesPack',
      resource: style
    })

    const publicConf = await this.publicConf.get()
    publicConf.style = style
    await this.savePublicConf(publicConf)
  }
}

export function createConf ({ tradle }) {
  return new Conf({ tradle })
}
