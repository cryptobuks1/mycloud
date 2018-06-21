// @ts-ignore
const Promise = global.Promise = require('bluebird')

import AWS from 'aws-sdk'
import { install as installSourceMapSupport } from 'source-map-support'

installSourceMapSupport()

AWS.config.setPromisesDependency(Promise)

// process.on('unhandledRejection', function (reason, promise) {
//   console.error('possibly unhandled rejection', reason)
// })

const warn = (...args) => {
  if (!process.env.IS_OFFLINE) {
    console.warn(...args)
  }
}

const mockery = require('mockery')
mockery.enable({
  warnOnReplace: false,
  warnOnUnregistered: false
})

// mockery.registerMock('@tradle/serverless', './')

warn('disabling "scrypt" as it is an unneeded dep (here) of ethereumjs-wallet')
mockery.registerMock('scrypt', {})

// https://github.com/Qix-/node-error-ex
warn(`replacing "error-ex" as it bluebird doesn't recognize its errors as Error objects`)
mockery.registerMock('error-ex', name => {
  return class CustomError extends Error {
    public name: string
    constructor(message) {
      super(message)
      this.name = name
    }
  }
})

// if (process.env.IS_OFFLINE || process.env.IS_LOCAL || process.env.NODE_ENV === 'test') {
//   warn('disabling "aws-xray-sdk" as this is a local environment')
//   mockery.registerMock('aws-xray-sdk', null)

//   ;[
//     'kafka-node',
//     'amqp',
//     'amqplib',
//     'mongodb',
//     'zmq',
//     'kerberos',
//   ].forEach(unused => {
//     warn(`disabling unused dev module: ${unused}`)
//     mockery.registerMock(unused, {})
//   })
// }
