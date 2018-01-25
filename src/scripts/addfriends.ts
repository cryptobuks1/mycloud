#!/usr/bin/env node

import path = require('path')
import promisify = require('pify')

import { loadRemoteEnv, loadCredentials } from '../cli/utils'

loadRemoteEnv()
loadCredentials()

const proc = promisify(require('child_process'))
const yml = require('../cli/serverless-yml')
const pathToFriendsFile = process.argv[2] || path.join(__dirname, '../samplebot/conf/friends.js')
const {
  stage=yml.custom.stage,
  friends
} = require(pathToFriendsFile)

Promise.all(
  friends.map(({ domain, url }) => {
  const payload = JSON.stringify({ domain, url })
  const command = `echo '${payload}' | sls invoke --stage=${stage} -f addfriend`
  console.log(`executing: ${command}`)
  return proc.exec(command, {
    cwd: process.cwd(),
    stdio: 'inherit'
  })
  .catch(console.error)
}))
.catch(err => {
  console.error(err)
  process.exit(1)
})
