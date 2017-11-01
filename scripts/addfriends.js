#!/usr/bin/env node

const path = require('path')
const promisify = require('pify')
const proc = promisify(require('child_process'))
const pathToFriendsFile = process.argv[2] || path.join(__dirname, '../conf/friends.js')
const { loadEnv, loadCredentials } = require('../lib/cli/utils')

loadEnv()
loadCredentials()

const yml = require('../lib/cli/serverless-yml')
const {
  stage=yml.custom.stage,
  friends
} = require(pathToFriendsFile)

Promise.all(
  friends.map(({ subdomain }) => {
  const payload = JSON.stringify({
    url: `https://${subdomain}.execute-api.us-east-1.amazonaws.com/dev/`
  })

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
