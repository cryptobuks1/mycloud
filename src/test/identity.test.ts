require('./env').install()

import _ from 'lodash'
import test from 'tape'
import sinon from 'sinon'
import { TYPE, WITNESSES } from '@tradle/constants'
import { loudAsync } from '../utils'
import { addLinks } from '../crypto'
import { Identity } from '../identity'
import { createTestTradle } from '../'

const aliceKeys = require('./fixtures/alice/keys')
const bobKeys = require('./fixtures/bob/keys')
const aliceIdentity = require('./fixtures/alice/identity')
const bobIdentity = require('./fixtures/bob/identity')
addLinks(aliceIdentity)
addLinks(bobIdentity)


test('sign/witness', loudAsync(async (t) => {
  // const sandbox = sinon.createSandbox()
  // const identity = new Identity({
  //   network: {
  //     flavor: 'ethereum',
  //     networkName: 'rinkeby'
  //   },,
  //   getIdentity: async () => aliceIdentity,
  //   getIdentityAndKeys: async () => ({
  //     identity: aliceIdentity,
  //     keys: aliceKeys
  //   })
  // })

  const tradle = createTestTradle()
  const { identity } = tradle
  const signed = await identity.sign({
    object: {
      [TYPE]: 'tradle.SimpleMessage',
    }
  })

  const witnessed = await identity.witness({
    object: signed
  })

  t.equal(witnessed[WITNESSES].length, 1)
  t.same(_.omit(witnessed, [WITNESSES]), signed)

  const rewitnessed = await identity.witness({
    object: witnessed
  })

  t.equal(rewitnessed[WITNESSES].length, 2)
  t.same(_.omit(rewitnessed, [WITNESSES]), signed)

  t.end()
}))
