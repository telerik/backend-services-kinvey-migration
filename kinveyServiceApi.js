'use strict';

const Kinvey = require('kinvey-node-sdk');
const asyncp = require('async-p');
const async = require('async');
const _ = require('underscore');
const Promise = require('bluebird');

const utils = require('./utils');

class KinveyServiceApi {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;

        this.mainFunctionNames = {
            'pre-save': 'onPreSave',
            'pre-fetch': 'onPreFetch',
            'pre-delete': 'onPreDelete',
            'post-save': 'onPostSave',
            'post-fetch': 'onPostFetch',
            'post-delete': 'onPostDelete'
        };

        try {
            Kinvey.init({
                appKey: this.config.kinvey_kid,
                appSecret: this.config.kinvey_app_secret,
                masterSecret: this.config.kinvey_master_secret
            });
        } catch (error) {
            throw error;
        }
    }

    createCustomEndpoints(cloudFunctions) {
        let self = this;

        return asyncp.eachSeries(
            cloudFunctions,
            function (cloudFunction) {
                self.logger.info(`\tMigrating cloud function '${cloudFunction.name}'`);

                const requestUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/business-logic/endpoints`;

                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': self.config.kinvey_token
                };

                const options = {
                    method: 'POST',
                    uri: requestUrl,
                    json: true,
                    headers: headers
                };

                const payload = {
                    name: cloudFunction.name,
                    code: cloudFunction.code
                };
                options.body = payload;

                return utils.makeRequest(options)
                    .catch((error) => {
                        self.logger.warn(`\t\tUnable to create custom endpoint '${cloudFunction.name}'. Error: ${error}`);
                        Promise.resolve();
                    });
            }
        );

    }

    createCollections(types) {
        const self = this;
        const requestUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/collections`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': self.config.kinvey_token
        };

        return asyncp.eachSeries(
            types,
            function (contentType) {
                self.logger.info(`\tCreating collection '${contentType.Name}'`);

                const kinveyTypeName = utils.convertCollectionNameToKinvey(contentType.Name);
                if (contentType.Name !== kinveyTypeName) {
                    self.logger.warn('\t\tWARNING: Invalid collection name. Changed to: ' + kinveyTypeName);
                }

                const payload = {name: kinveyTypeName};
                const options = {
                    method: 'POST',
                    uri: requestUrl,
                    json: true,
                    headers: headers,
                    body: payload
                };

                return utils.makeRequest(options)
                .catch((error) => {
                    self.logger.warn(`\t\tUnable to create collection '${kinveyTypeName}'. Error: ${error}`);
                    Promise.resolve();
                })
            }
        );
    }

    checkManagementAuthorization() {
        const self = this;

        if (!self.config.kinvey_token) {
            throw new Error('Kinvey management access not initialized. Run using --login and then try again.');
        }

        const requestUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/collections`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': self.config.kinvey_token
        };

        const options = {
            method: 'GET',
            uri: requestUrl,
            headers: headers
        };

        return utils.makeRequest(options)
        .catch((error) => {
            if (error.statusCode === 401) {
                throw new Error('Invalid authentication to Kinvey management API. Authenticate using --login and then try again.');
            } else {
                throw error;
            }
        });
    }

    getRoles() {
        const requestUrl = `${this.config.kinvey_api_host}/roles/${this.config.kinvey_kid}`;
        let authHeaderPass = `${this.config.kinvey_kid}:${this.config.kinvey_master_secret}`;
        authHeaderPass = new Buffer(authHeaderPass).toString('base64');

        const authHeader = `Basic ${authHeaderPass}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };

        const options = {
            method: 'GET',
            uri: requestUrl,
            json: true,
            headers: headers
        };

        return utils.makeRequest(options);
    }

    createRoles(roles) {
        let self = this;

        return this.getRoles()
        .then((kinveyRoles) => {
            kinveyRoles = kinveyRoles.map((item) => item.name);

            let rolesToCreate = [];
            for (let i = 0; i < roles.length; i++) {
                var role = roles[i];
                if (kinveyRoles.indexOf(role.Name) === -1) {
                    rolesToCreate.push(role);
                } else {
                    self.logger.info(`\tRole '${role.Name}' already exists.`);
                }
            }

            if (rolesToCreate.length == 0) {
                return Promise.resolve();
            }

            const promises = [];
            const requestUrl = `${self.config.kinvey_api_host}/roles/${self.config.kinvey_kid}`;

            let authHeaderPass = `${self.config.kinvey_kid}:${self.config.kinvey_master_secret}`;
            authHeaderPass = new Buffer(authHeaderPass).toString('base64');

            const authHeader = `Basic ${authHeaderPass}`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            };

            for (const role of rolesToCreate) {
                const payload = {name: role.Name};

                const options = {
                    method: 'POST',
                    uri: requestUrl,
                    json: true,
                    headers: headers,
                    body: payload
                };

                self.logger.info('\tMigrating role: ' + role.Name);

                promises.push(utils.makeRequest(options))
            }

            return utils.resolveAllPromises(promises);
        })



    }

    _createRole(everliveRole) {




    }

    setUserRole(userId, roleId) {
        const requestUrl = `${this.config.kinvey_api_host}/roles/${this.config.kinvey_kid}/${roleId}/membership`;
        let authHeaderPass = `${this.config.kinvey_kid}:${this.config.kinvey_master_secret}`;
        authHeaderPass = new Buffer(authHeaderPass).toString('base64');

        const authHeader = `Basic ${authHeaderPass}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };

        const payload = {userIds: [userId]};

        const options = {
            method: 'POST',
            uri: requestUrl,
            json: true,
            headers: headers,
            body: payload
        };

        return utils.makeRequest(options);
    }

    _createCollectionHooks(collectionName, hooksToCreate, hooksCode) {
        const self = this;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': self.config.kinvey_token
        };

        if (collectionName === 'Users') {
            collectionName = 'user';
        }

        return asyncp.eachSeries(
            hooksToCreate,
            function (hook) {
                const requestUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/business-logic/collections/${collectionName}/${hook}`;
                const hookTemplate = self._renderDefaultHookTemplate(hook);
                const payload = {
                    code: `${hookTemplate}${hooksCode}`,
                    name: self._getHookMainFunctionName(hook)
                };

                self.logger.info(`    Creating hook: ${hook}...`);

                const options = {
                    method: 'PUT',
                    uri: requestUrl,
                    json: true,
                    headers: headers,
                    body: payload
                };

                return utils.makeRequest(options);
            }
        );
    }

    insertItems(collectionName, items, kinveyRoles, bsRoles) {
        let self = this;

        const tasks = [];

        items.forEach((item) => {
            const kinveyItem = self._transformItemToKinvey(item, kinveyRoles, bsRoles);

            tasks.push(
                function () {
                    let options = {
                        method: 'POST',
                        uri: collectionName,
                        json: true,
                        headers: {
                            'X-Kinvey-Skip-Business-Logic': true
                        },
                        body: kinveyItem
                    };

                    return self._makeKinveyDataRequest(options)
                    .catch((createError) => {
                        self.logger.warn(`\tError occurred while migrating item with ID ${kinveyItem._id}: ${createError}`);
                        return Promise.resolve();
                    });
                }
            );
        });

        return asyncp.parallelLimit(tasks, this.config.max_parallel_requests);
    }

    insertFilesInKinvey(items, done) {
        const self = this;
        async.each(
            items,
            (item, callback) => {
                let responseStream;

                //TODO: optimize if the file already exists in Kinvey

                self.logger.info('\tUploading file: ' + item.Filename + ' (' + (item.Length / 1024) + ' KB)');

                async.series([
                        (cb1) => {
                            const options = {
                                method: 'GET',
                                uri: item.Uri,
                                encoding: null
                            };

                            utils.makeRequest(options)
                                .then((fileStream) => {
                                    responseStream = fileStream;
                                    cb1();
                                })
                                .catch((getFilesError) => {
                                    cb1(getFilesError);
                                });
                        },
                        (cb2) => {
                            item = self._transformFileItemToKinvey(item);
                            Kinvey.Files.upload(responseStream, item)
                                .then(() => {
                                    cb2();
                                })
                                .catch((uploadFilesError) => {
                                    cb2(uploadFilesError);
                                });
                        }
                    ],
                    callback
                );

            },
            done
        );
    }

    createUser(everliveUser, kinveyRoles, bsRoles) {
        let self = this;
        this.logger.debug(`\tMigrating User '${everliveUser.Username}'`);

        const requestUrl = `${this.config.kinvey_api_host}/user/${this.config.kinvey_kid}`;

        let authHeaderPass = `${this.config.kinvey_kid}:${this.config.kinvey_master_secret}`;
        authHeaderPass = new Buffer(authHeaderPass).toString('base64');

        const authHeader = `Basic ${authHeaderPass}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'x-kinvey-master-create-user': true
        };

        let kinveyUser = this._transformUserToKinvey(everliveUser, kinveyRoles, bsRoles);

        const options = {
            method: 'POST',
            uri: requestUrl,
            json: true,
            headers: headers,
            body: kinveyUser
        };

        return utils.makeRequest(options)
        .catch((createKinveyUserError) => {
            self.logger.warn(`\tError occurred while migrating user ${kinveyUser.username}: ${createKinveyUserError}`);
            return Promise.resolve();
        });
    }

    _makeKinveyDataRequest(options) {
        if (options.uri.indexOf(this.config.kinvey_api_host) === -1) {
            options.uri = `${this.config.kinvey_api_host}/appdata/${this.config.kinvey_kid}/${options.uri}`;
        }

        if (!options.headers) options.headers = {};
        if (!options.headers['Authorization']) {
            let authHeaderPass = `${this.config.kinvey_kid}:${this.config.kinvey_master_secret}`;
            authHeaderPass = new Buffer(authHeaderPass).toString('base64');

            const authHeader = `Basic ${authHeaderPass}`;

            options.headers['Authorization'] = authHeader;
        }

        return utils.makeRequest(options);
    }

    _renderDefaultHookTemplate(hookType) {
        const mainFunctionName = this._getHookMainFunctionName(hookType);
        const template = `function ${mainFunctionName}(request, response, modules) {\n\t\tresponse.continue();\n}\n`;
        return template;
    }

    _getHookMainFunctionName(hook) {
        return this.mainFunctionNames[hook];
    }

    _transformItemToKinvey(item, kinveyRoles, bsRoles) {
        let newItem = _.clone(item);

        //Migrate ID
        newItem._id = item.Id;
        delete newItem.Id;

        //Migrate metadata
        newItem._kmd = {};
        newItem._kmd.ect = item.CreatedAt;
        newItem._kmd.lmt = item.ModifiedAt;
        delete newItem.CreatedAt;
        delete newItem.ModifiedAt;

        //Migrate owner
        if (newItem.Owner === '00000000-0000-0000-0000-000000000000') {
            newItem.Owner = this.config.kinvey_kid;
        }
        if (!newItem._acl) {
            newItem._acl = {};
            newItem._acl.creator = newItem.Owner;
        }
        delete newItem.Owner;

        //Migrate ACL
        this._transformItemAclToKinvey(newItem, kinveyRoles, bsRoles);

        return newItem;
    }

    _transformSocialIdentityToKinvey(identity) {
        Object.keys(identity).forEach((key) => {
            if (key === 'Facebook') {
                identity.facebook = identity.Facebook;
                delete identity.Facebook;
            } else if (key === 'Twitter') {
                identity.twitter = identity.Twitter;
                delete identity.Twitter;
            } else if (key === 'Google') {
                identity.google = identity.Google;
                delete identity.Google;
            } else {
                this.logger.warn(`WARNING.... ${key} Social Identity Provider not supported in Kinvey`);
                return identity = {};
            }
        });

        return identity;
    }

    _transformFileItemToKinvey(fileItem) {
        let newItem = _.clone(fileItem);
        newItem._id = fileItem.Id;
        newItem._kmd = {};
        newItem._kmd.ect = fileItem.CreatedAt;
        newItem._kmd.lmt = fileItem.ModifiedAt;

        if (newItem.Owner === '00000000-0000-0000-0000-000000000000') {
            newItem.Owner = this.config.kinvey_kid;
        }

        if (!newItem._acl) {
            newItem._acl = {};
            newItem._acl.creator = newItem.Owner;
        }

        newItem.filename = fileItem.Filename;
        newItem.mimeType = fileItem.ContentType;
        newItem.size = fileItem.Length;
        newItem.public = true;

        delete newItem.Id;
        delete newItem.Owner;
        delete newItem.CreatedAt;
        delete newItem.ModifiedAt;
        delete newItem.Length;
        delete newItem.Storage;
        delete newItem.Uri;
        delete newItem.Filename;

        return newItem;
    }

    _transformUserToKinvey(userItem, kinveyRoles, bsRoles) {
        //Migrate common fields
        let newItem = this._transformItemToKinvey(userItem, kinveyRoles, bsRoles);

        //Migrate role
        let roleName = bsRoles[userItem.Role];
        let kinveyRoleId = kinveyRoles[roleName];
        if (!kinveyRoleId) {
            self.logger.warn(`\tUnable to migrate role for user with ID '${userItem.Id}'. Role not found in Kinvey: ${roleName}`);
        } else {
            newItem._kmd.roles = [
                {
                    roleId: kinveyRoleId,
                    grantedBy: this.config.kinvey_kid,
                    grantDate: newItem._kmd.ect
                }
            ];
        }
        delete newItem.Role;

        //Migrate verification
        if (newItem.IsVerified) {
            newItem._kmd.emailVerification = {
                status: 'confirmed',
                lastStateChangeAt: userItem.CreatedAt,
                lastConfirmedAt: userItem.CreatedAt,
                emailAddress: userItem.Email
            };
        }
        delete newItem.IsVerified;
        delete newItem.VerificationCode;

        newItem.email = userItem.Email;
        delete newItem.Email;

        //Migrate credentials
        newItem.username = userItem.Username;
        if (userItem.Password && userItem.PasswordSalt) {
            newItem.password = {
                type: 'telerik',
                hash: userItem.Password,
                salt: userItem.PasswordSalt
            };
        }
        delete newItem.Username;
        delete newItem.Password;
        delete newItem.PasswordSalt;

        //Migrate social identities
        if (userItem.Identity) {
            newItem._socialIdentity = this._transformSocialIdentityToKinvey(userItem.Identity);
        }
        delete newItem.Identity;

        //Delete other unnecessary fields
        delete newItem.IdentityProvider;

        return newItem;
    }

    _transformItemAclToKinvey(item, kinveyRoles, bsRoles) {
        if (item._ACL) {
            item._acl = {};

            item._acl.gr = item._ACL.EveryoneCanRead;
            item._acl.r = item._ACL.UsersCanRead;

            if (item._ACL.UsersCanUpdate.length > 0 && item._ACL.UsersCanDelete.length > 0) {

                item = this._checkAclUserPermissions(item);
            }

            item._acl.roles = {};

            item._acl.roles.r = this._transformAclRoleIdToKinvey(item._ACL.RolesCanRead, kinveyRoles, bsRoles);
            item._acl.roles.u = this._transformAclRoleIdToKinvey(item._ACL.RolesCanUpdate, kinveyRoles, bsRoles);
            item._acl.roles.d = this._transformAclRoleIdToKinvey(item._ACL.RolesCanDelete, kinveyRoles, bsRoles);

            delete item._ACL;
        }
    }

    _transformAclRoleIdToKinvey(oldItemRole, kinveyRoles, bsRoles) {
        let roleName;
        let kinveyRoleId;
        let transformedRoles = [];

        for (let i = 0; i < oldItemRole.length; i++) {
            roleName = bsRoles[oldItemRole[i]];
            kinveyRoleId = kinveyRoles[roleName];
            transformedRoles.push(kinveyRoleId);
        }

        return transformedRoles;
    }

    _checkAclUserPermissions(items) {
        let usersCanWrite = [];

        for (let i in items._ACL.UsersCanUpdate) {
            if (items._ACL.UsersCanDelete.indexOf(items._ACL.UsersCanUpdate[i] > -1)) {
                usersCanWrite.push(items._ACL.UsersCanUpdate[i]);
            }
        }

        items._acl.w = usersCanWrite;

        return items;
    }
}

module.exports = KinveyServiceApi;
