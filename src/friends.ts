import _ from 'lodash'
// @ts-ignore
import Promise from 'bluebird'
import Cache from 'lru-cache'
import buildResource from '@tradle/build-resource'
import { TYPE, AUTHOR, TIMESTAMP, SIG, ORG, ORG_SIG } from './constants'
import { addLinks } from './crypto'
import { get, cachifyFunction, parseStub, omitVirtual } from './utils'
import { Identities, Identity, Logger, ILoadFriendOpts, Storage, DB, ITradleObject } from './types'

import models from './models'
import Errors from './errors'

const FRIEND_TYPE = 'tradle.MyCloudFriend'
const model = models[FRIEND_TYPE]
const TEN_MINUTES = 10 * 60 * 60000
const createCache = () => new Cache({ max: 100, maxAge: TEN_MINUTES })

type FriendsOpts = {
  storage: Storage
  identity: Identity
  identities: Identities
  logger: Logger
  isDev?: boolean
}

export default class Friends {
  public cache: any
  public logger: Logger
  // lazy
  private get identities() {
    return this.components.identities
  }
  private get identity() {
    return this.components.identity
  }
  private storage: Storage
  private db: DB
  private components: FriendsOpts
  private _clearCacheForPermalink: (permalink: string) => void
  private isDev
  constructor(components: FriendsOpts) {
    this.components = components

    const { logger, storage, isDev } = components
    this.isDev = isDev
    this.storage = storage
    this.db = storage.db
    this.cache = createCache()
    this.logger = logger

    const { call, del } = cachifyFunction(this, 'getByIdentityPermalink')
    this.getByIdentityPermalink = call
    this._clearCacheForPermalink = del
  }

  public load = async (opts: ILoadFriendOpts): Promise<ITradleObject> => {
    let { url } = opts
    if (!url) throw new Errors.InvalidInput(`expected "url" of friend's MyCloud`)

    url = url.replace(/[/]+$/, '')

    this.logger.debug('loading friend', opts)

    const infoUrl = getInfoEndpoint(url)
    const info = await get(infoUrl)
    const {
      bot: { pub },
      org
    } = info

    const { name, domain } = org
    if (opts.domain && domain !== opts.domain) {
      throw new Errors.InvalidInput(`expected domain "${opts.domain}", got ${domain}`)
    }

    return await this.add({
      name,
      url,
      domain,
      org,
      identity: pub
    })
  }

  public add = async (props: {
    name: string
    domain: string
    url: string
    org: any
    identity: any
  }): Promise<ITradleObject> => {
    const { name, domain, identity, org } = props
    addLinks(identity)

    const myIdentity = await this.identity.getPublic()
    if (myIdentity._permalink === identity._permalink || myIdentity._link === identity._link) {
      throw new Error('refusing to add self as friend')
    }

    let existing
    try {
      existing = await this.getByIdentityPermalink(identity._permalink)
    } catch (err) {
      existing = {}
    }

    // if (existing.identity._permalink !== identity._permalink) {
    //   throw new Errors.InvalidAuthor(`expected ${existing.identity._permalink}`)
    // }

    const keys = Object.keys(model.properties)
    let object = buildResource({ models, model })
      .set({
        ..._.pick(existing, keys),
        ..._.pick(props, keys)
      })
      .toJSON()

    const compareKeys = _.difference(Object.keys(object), [TIMESTAMP, SIG])
    const isSame = _.isEqual(_.pick(object, compareKeys), _.pick(existing, compareKeys))
    if (org) await this.storage.save({ object: org })

    if (isSame) {
      // this.cache.set(identity._permalink, existing)
      this.logger.debug('already have friend', object)
      return existing
    }

    this.logger.debug('adding friend', object)
    if (Object.keys(existing).length) {
      object = buildResource({ models, model })
        .set(buildResource.version(existing))
        .set(_.pick(props, keys))
        .toJSON()
    }

    const promiseAddContact = this.identities.addContact(identity)
    const signed = await this.identity.sign({ object })
    await Promise.all([promiseAddContact, this.storage.save({ object: signed })])

    // console.log('ADDED FRIEND', console.log(JSON.stringify(signed, null, 2)))
    return signed
  }

  public getByDomain = async (domain: string) => {
    return await this.db.findOne({
      filter: {
        EQ: {
          [TYPE]: FRIEND_TYPE,
          domain
        }
      }
    })
  }

  public getByIdentityPermalink = async (permalink: string) => {
    return await this.db.findOne({
      filter: {
        EQ: {
          [TYPE]: FRIEND_TYPE,
          'identity._permalink': permalink
        }
      }
    })
  }

  public list = async () => {
    const { items } = await this.db.list(FRIEND_TYPE, {
      allowScan: true,
      limit: Infinity
    })

    return items
  }

  public clear = async () => {
    if (!this.isDev) throw new Errors.DevStageOnly('only allows in test mode')

    const friends = await this.list()
    await Promise.map(friends, friend => this.del(friend), {
      concurrency: 10
    })
  }

  public removeByIdentityPermalink = async (permalink: string) => {
    try {
      const friend = await this.getByIdentityPermalink(permalink)
      await this.del(friend)
    } catch (err) {
      Errors.ignoreNotFound(err)
    }
  }

  public removeByDomain = async (domain: string) => {
    try {
      const friend = await this.getByDomain(domain)
      await this.del(friend)
    } catch (err) {
      Errors.ignoreNotFound(err)
    }
  }

  private del = async friend => {
    this._clearCacheForPermalink(parseStub(friend.identity).permalink)
    // this.cache.del(parseStub(friend.identity).permalink)
    await this.db.del(friend)
  }
}

export { Friends }

function getInfoEndpoint(url) {
  if (!url.endsWith('/info')) {
    url += '/info'
  }

  return url
}

// function get ({ permalink }) {
//   return db.latest({
//     [TYPE]: FRIEND_TYPE,
//     _permalink
//   })
// }

// (async function () {
//   await load({
//     name: 'Tradle',
//     url: 'https://7hixz15a6k.execute-api.us-east-1.amazonaws.com/dev/tradle'
//   })
// }())
// .catch(console.error)
