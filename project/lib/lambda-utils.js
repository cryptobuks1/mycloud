const clone = require('xtend')
const debug = require('debug')('tradle:sls:lambda-utils')
const aws = require('./aws')
const { serverlessPrefix } = require('./env')
const topicToLamba = require('./lambda-by-topic')
const invokeDefaults = {
  InvocationType: 'RequestResponse',
}

const RESOLVED = Promise.resolve()

exports.invokeForTopic = function invokeForTopic (topic, items) {
  if (!serverlessPrefix) {
    throw new Error('this function requires the "serverlessPrefix" environment variable')
  }

  if (!(topic in topicToLamba)) {
    debug(`ignoring event with topic "${topic}", corresponding lambda not found`)
    return RESOLVED
  }

  // hmm, should we invoke with RequestResponse?
  // those other lambdas better be fast
  const params = clone(
    invokeDefaults,
    topicToLamba[topic],
    {
      Payload: JSON.stringify(items)
    }
  )

  if (params.InvocationType !== 'RequestResponse') {
    delete params.LogType
  }

  debug(`invoking lambda "${params.FunctionName}" for "${topic}" event`)
  return aws.lambda.invoke(params).promise()
}

