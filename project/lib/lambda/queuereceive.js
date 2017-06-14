const microtime = require('microtime')
const debug = require('debug')('tradle:sls:λ:queuereceive')
const wrap = require('../wrap')
const user = require('../user')
const { prettify } = require('../utils')
const { SEQ } = require('../constants')

exports.handler = wrap.generator(function* (event, context) {
  debug('[START]', microtime.now(), prettify(event))
  // the user sent us a message
  const { clientId, data } = event
  const message = new Buffer(data.data, 'base64')
  yield user.onSentMessage({ clientId, message })
  debug('preceived')
})
