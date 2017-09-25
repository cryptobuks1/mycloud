#!/usr/bin/env node

/**
 * Deletes tables that were dynamically generated for per-data-model
 */

const co = require('co')
const { dynamodb } = require('../lib/aws')
const { batchify, runWithBackoffWhile } = require('../lib/utils')
const { SERVERLESS_PREFIX } = require('../test/service-map')
const { service, stage } = require('minimist')(process.argv.slice(2), {
  default: {
    service: 'tradle',
    stage: 'dev'
  }
})

const serviceStageRegExp = new RegExp(`^${service}-${stage}-`)
const {
  service: {
    resources: { Resources }
  }
} = require('../.serverless/serverless-state')

const tablesToKeep = Object.keys(Resources)
  .map(key => Resources[key])
  .filter(resource => resource.Type === 'AWS::DynamoDB::Table')
  .map(table => table.Properties.TableName)

co(function* () {
  const { TableNames } = yield dynamodb.listTables().promise()
  const toDelete = TableNames.filter(name => {
    return !tablesToKeep.includes(name) && !serviceStageRegExp.test(name)
  })

  if (!toDelete) return

  console.log('deleting', toDelete)

  for (const TableName of TableNames) {
    console.log(`deleting ${TableName}`)
    runWithBackoffWhile(co.wrap(function* () {
      yield dynamodb.deleteTable({ TableName }).promise()
    }), {
      shouldTryAgain: err => err.name === 'LimitExceededException',
      initialDelay: 1000,
      maxDelay: 10000,
      maxTime: 5 * 60 * 1000
    })
  }

  console.log('deleted', toDelete)
})
.catch(console.error)
