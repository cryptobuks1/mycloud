#!/usr/bin/env node

import { loadCredentials, genLocalResources } from '../cli/utils'
import { lambdaUtils } from '../'

const {
  enable
} = require('minimist')(process.argv.slice(2), {
  alias: {
    e: 'enable'
  },
  boolean: ['enable']
})

const yml = require('../cli/serverless-yml')
const {
  service,
  custom: { stage, prefix }
} = yml

loadCredentials()

console.log('service', service)
console.log('stage', stage)
const action = enable ? 'enable' : 'disable'
console.log(`will ${action} all functions starting with prefix ${prefix}`)

;(async () => {
  await lambdaUtils.updateEnvironments(function ({ FunctionName }) {
    if (FunctionName.startsWith(prefix)) {
      return {
        DISABLED: enable ? null : 'y'
      }
    }
  })
})()
.catch(err => {
  console.error(err)
  process.exit(1)
})
