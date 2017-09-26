"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const debug = require('debug')('tradle:sls:identities');
const constants_1 = require("./constants");
const { MESSAGE } = constants_1.TYPES;
const errors_1 = require("./errors");
const utils_1 = require("./utils");
const crypto_1 = require("./crypto");
const types = require("./types");
class Identities {
    constructor(opts) {
        this.getIdentityMetadataByPub = pub => {
            debug('get identity metadata by pub');
            return this.pubKeys.get({
                Key: { pub },
                ConsistentRead: true
            });
        };
        this.getIdentityByPub = (pub) => __awaiter(this, void 0, void 0, function* () {
            const { link } = yield this.getIdentityMetadataByPub(pub);
            try {
                return yield this.objects.getObjectByLink(link);
            }
            catch (err) {
                debug('unknown identity', pub, err);
                throw new errors_1.NotFound('identity with pub: ' + pub);
            }
        });
        this.getIdentityByPermalink = (permalink) => __awaiter(this, void 0, void 0, function* () {
            const params = {
                IndexName: 'permalink',
                KeyConditionExpression: 'permalink = :permalinkValue',
                ExpressionAttributeValues: {
                    ":permalinkValue": permalink
                }
            };
            debug('get identity by permalink');
            const { link } = yield this.pubKeys.findOne(params);
            try {
                return yield this.objects.getObjectByLink(link);
            }
            catch (err) {
                debug('unknown identity', permalink, err);
                throw new errors_1.NotFound('identity with permalink: ' + permalink);
            }
        });
        this.getExistingIdentityMapping = identity => {
            debug('checking existing mappings for pub keys');
            const lookups = identity.pubkeys.map(obj => this.getIdentityMetadataByPub(obj.pub));
            return utils_1.firstSuccess(lookups);
        };
        this.validateNewContact = (identity) => __awaiter(this, void 0, void 0, function* () {
            identity = utils_1.omitVirtual(identity);
            let existing;
            try {
                existing = yield this.getExistingIdentityMapping(identity);
            }
            catch (err) { }
            const { link, permalink } = crypto_1.addLinks(identity);
            if (existing) {
                if (existing.link === link) {
                    debug(`mapping is already up to date for identity ${permalink}`);
                }
                else if (identity[constants_1.PREVLINK] !== existing.link) {
                    debug('identity mapping collision. Refusing to add contact:', JSON.stringify(identity));
                    throw new Error(`refusing to add identity with link: "${link}"`);
                }
            }
            return {
                identity: existing || identity,
                exists: !!existing
            };
        });
        this.addContact = (object) => __awaiter(this, void 0, void 0, function* () {
            if (object) {
                utils_1.typeforce(types.identity, object);
            }
            else {
                object = yield this.objects.getObjectByLink(crypto_1.getLink(object));
            }
            const { link, permalink } = crypto_1.addLinks(object);
            const putPubKeys = object.pubkeys
                .map(({ pub }) => this.putPubKey({ link, permalink, pub }));
            yield Promise.all(putPubKeys.concat(this.objects.putObject(object)));
        });
        this.putPubKey = (opts) => {
            const { link, permalink, pub } = opts;
            debug(`adding mapping from pubKey "${pub}" to link "${link}"`);
            return this.pubKeys.put({
                Item: { link, permalink, pub }
            });
        };
        this.addAuthorInfo = (object) => __awaiter(this, void 0, void 0, function* () {
            if (!object._sigPubKey) {
                this.objects.addMetadata(object);
            }
            const type = object[constants_1.TYPE];
            const isMessage = type === MESSAGE;
            const pub = isMessage && object.recipientPubKey.pub.toString('hex');
            const promises = {
                author: yield this.getIdentityMetadataByPub(object._sigPubKey),
                recipient: yield (pub ? this.getIdentityMetadataByPub(pub) : utils_1.RESOLVED_PROMISE)
            };
            const { author, recipient } = promises;
            utils_1.setVirtual(object, { _author: author.permalink });
            if (recipient) {
                utils_1.setVirtual(object, { _recipient: recipient.permalink });
            }
            return object;
        });
        this.validateAndAdd = (identity) => __awaiter(this, void 0, void 0, function* () {
            const result = yield this.validateNewContact(identity);
            if (!result.exists)
                return this.addContact(result.identity);
        });
        utils_1.logify(this);
        utils_1.bindAll(this);
        const { tables, objects } = opts;
        this.objects = objects;
        this.pubKeys = tables.PubKeys;
    }
}
module.exports = Identities;
//# sourceMappingURL=identities.js.map