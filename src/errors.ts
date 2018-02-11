// const debug = require('debug')('tradle:sls:errors')
import _ = require('lodash')

import ex = require('error-ex')
import { AssertionError } from 'assert'
import { TfTypeError, TfPropertyTypeError } from 'typeforce'

function createError (name: string): ErrorConstructor {
  return ex(name)
}

const types = {
  system: [
    // JavaScript
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,

    // Node
    AssertionError,

    // Typeforce
    TfTypeError,
    TfPropertyTypeError
  ],
  developer: [
    'system',
    {
      // dynamodb
      code: 'ValidationException'
    }
  ]
}

const isSystemError = err => types.system.some(ErrorCtor => {
  return err instanceof ErrorCtor
})

const matches = (err, type) => {
  if (!(err && type)) {
    throw new Error('expected error and match parameters')
  }

  if (type in types) {
    // resolve alias
    return matches(err, types[type])
  }

  if (Array.isArray(type)) {
    return type.some(subType => matches(err, subType))
  }

  if (typeof type === 'function') {
    return err instanceof type
  }

  for (let key in type) {
    let expected = type[key]
    let actual = err[key]
    if (expected instanceof RegExp) {
      if (!expected.test(actual)) {
        return false
      }
    } else if (!_.isEqual(expected, actual)) {
      return false
    }
  }

  return true
}

const ignore = (err, type) => {
  if (!matches(err, type)) {
    throw err
  }
}

const rethrow = (err, type) => {
  if (matches(err, type)) {
    throw err
  }
}

const _HttpError = createError('HttpError')

class ExportableError extends Error {
  public toJSON = () => exportError(this)
}

class HttpError extends ExportableError {
  public status: number
  constructor(code, message) {
    super(message)
    this.status = code || 500
  }

  public toJSON = () => ({ ...exportError(this), status: this.status })
}

class ErrorWithLink extends ExportableError {
  public link: string
  constructor(message, link) {
    super(message)
    this.link = link
  }

  public toJSON = () => ({ ...exportError(this), link: this.link })
}

class CloudServiceError extends Error {
  public service: string
  public retryable: boolean
  constructor (opts: {
    message:string,
    service:string,
    retryable: boolean,
    [x:string]: any
  }) {
    super(opts.message)
    _.extend(this, opts)
  }
}

class Duplicate extends ErrorWithLink {}
class TimeTravel extends ErrorWithLink {}

const exportError = (err:Error) => _.pick(err, ['message', 'stack', 'name', 'type'])

const errors = {
  ignoreNotFound: err => {
    ignore(err, errors.NotFound)
    return undefined
  },
  ClientUnreachable: createError('ClientUnreachable'),
  NotFound: createError('NotFound'),
  InvalidSignature: createError('InvalidSignature'),
  InvalidAuthor: createError('InvalidAuthor'),
  UnknownAuthor: createError('UnknownAuthor'),
  InvalidVersion: createError('InvalidVersion'),
  InvalidMessageFormat: createError('InvalidMessageFormat'),
  InvalidObjectFormat: createError('InvalidObjectFormat'),
  PutFailed: createError('PutFailed'),
  MessageNotForMe: createError('MessageNotForMe'),
  HandshakeFailed: createError('HandshakeFailed'),
  LambdaInvalidInvocation: createError('LambdaInvalidInvocation'),
  InvalidInput: createError('InvalidInput'),
  ClockDrift: createError('ClockDrift'),
  BatchPutFailed: createError('BatchPutFailed'),
  ErrorWithLink,
  Duplicate,
  TimeTravel,
  CloudServiceError,
  ExecutionTimeout: createError('ExecutionTimeout'),
  Exists: createError('Exists'),
  HttpError,
  Timeout: createError('Timeout'),
  export: (err:Error):any => {
    if (err instanceof ExportableError) {
      return (err as ExportableError).toJSON()

    }
    return exportError(err)
  },
  isDeveloperError: (err:Error): boolean => {
    return matches(err, 'developer')
  },
  isCustomError: (err:Error): boolean => {
    return err.name in errors
  },
  /**
   * check if error is of a certain type
   * @param  {Error}             err
   * @param  {String}  type
   * @return {Boolean}
   */
  is: (err:Error, errType:any): boolean => {
    const { type } = errType
    if (!type) return false

    const { name='' } = err
    return name.toLowerCase() === type.toLowerCase()
  },
  ignore,
  rethrow,
  matches
}

export = errors
