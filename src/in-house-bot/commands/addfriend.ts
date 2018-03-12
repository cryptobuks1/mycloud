import { parse as parseURL } from 'url'
import { isEqual } from 'lodash'
import yn from 'yn'
import parse from 'yargs-parser'
import buildResource from '@tradle/build-resource'
import validateResource from '@tradle/validate-resource'
import models from '../../models'
import Errors from '../../errors'
import { ICommand } from '../types'

const { parseStub } = validateResource.utils
const description = `add a known provider by url.
Models received from them will be limited to the namespace corresponding to the provider --domain option`

const EXAMPLE = `/addfriend "https://example.com" --domain example.com`
const USAGE = `
${EXAMPLE}

Keep in mind that "domain" will be used to validate the namespace of foreign models.`

export const command:ICommand = {
  name: 'addfriend',
  description,
  examples: [
    '/addfriend tradle.example.com --domain tradle.example.com',
    '/addfriend https://tradle.example.com --domain tradle.example.com',
  ],
  parse: (argsStr:string) => {
    const args = parse(argsStr)
    const { domain } = args
    let url = args._[0]
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }

    const { hostname } = parseURL(url)
    // if (!domain) {
    //   throw new Error(`expected "--domain", for example: ${USAGE}`)
    // }

    return { url, domain }
  },
  exec: async function ({ commander, req, args }) {
    const { url, domain } = args
    const friend = await commander.bot.friends.load({ url, domain })
    const friendStub = buildResource.stub({
      models,
      resource: friend
    })

    const userId = friend._identityPermalink
    const { users } = commander.bot
    let user
    try {
      user = await users.get(userId)
    } catch (err) {
      Errors.ignoreNotFound(err)
      await users.save({ id: userId, friend: friendStub })
    }

    if (user && user.friend !== friend.permalink) {
      user.friend = friend.permalink
      await users.merge({ id: userId, friend: friendStub })
    }

    return friend
  },
  sendResult: async ({ commander, req, args, result }) => {
    await commander.sendSimpleMessage({
      req,
      to: req.user,
      message: `added friend ${result.name} from ${args.url}`
    })
  }
}
