import http from 'http'
import https from 'https'
import { IAWSServiceConfig, AWSHttpOptions } from './types'

export const createConfig = ({ region, local }: {
  region: string
  local?: boolean
}): IAWSServiceConfig => {
  const opts = {
    keepAlive: true,
    maxSockets: 50,
    rejectUnauthorized: true
  }

  const httpOptions:AWSHttpOptions = {}
  if (!local) {
    const agent = new https.Agent(opts)
    // agent is an EventEmitter
    // @ts-ignore
    agent.setMaxListeners(0)
    httpOptions.agent = agent
  }


  const services = {
    maxRetries: 6,
    region,
    s3: {
      signatureVersion: 'v4',
    },
    iotdata: {
      httpOptions: {
        connectTimeout: 10000,
        timeout: 10000,
      }
    },
    httpOptions
  } as IAWSServiceConfig

  if (local) {
    const localIP = require('localip')()
    const localstackEndpoints = require('./test/localstack')

    for (let name in localstackEndpoints) {
      let lname = name.toLowerCase()
      if (!services[lname]) services[lname] = { region }

      let endpoint = localstackEndpoints[name]
      services[lname].endpoint = endpoint.replace(/localhost/, localIP)
    }

    services.s3.s3ForcePathStyle = true
  }

  return services
}
