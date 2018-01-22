'use strict';

const Everlive = require('everlive-sdk');
const utils = require('./utils');

class BackendServicesApi {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        const el = new Everlive({
            appId: this.config.bs_app_id,
            scheme: 'https'
        });
    }

    getTypes() {
        const headers = {};
        const filter = {Kind: 2, DataLinkId: null};
        headers['x-everlive-filter'] = JSON.stringify(filter);

        return this.makeBSMetadataRequest('GET', '/Types', headers);
    }

    getRoles() {
        return this.makeBSMetadataRequest('GET', '/Roles');
    }

    getUserRoleById(user) {
        return this.makeBSMetadataRequest('GET', `/Roles/${user.Role}`)
            .then((role) => {
                user.RoleName = role.Result.Name;
                return user;
            })
            .catch((getRoleNameError) => {
                return Promise.reject(getRoleNameError);
            });
    }

    getCloudFunctions() {
        return this.makeBSMetadataRequest('GET', '/CloudFunctions');
    }

    getCloudHookTypes() {
        const headers = {};
        const filter = {Title: {$nin: ["System.Files", "Files"]}};

        headers['x-everlive-filter'] = JSON.stringify(filter);
        return this.makeBSMetadataRequest('GET', '/Types', headers);
    }

    getGeoLocationFields(types) {
        const promises = [];
        const headers = {};
        const filter = {DataType: 5};
        headers['x-everlive-filter'] = JSON.stringify(filter);

        for (const type of types) {
            const path = `/Types/${type.Id}/Fields`;
            promises.push(
                this.makeBSMetadataRequest('GET', path, headers)
                    .then((response) => {
                        if (response.Count === 1) {
                            // Append BS Location Field if there is a single field ONLY!!!
                            type.locationFieldName = response.Result[0].Name;
                        } else if (response.Count > 1) {
                            // Warn the User for multiple location fields
                            const locationFields = response.Result.map((elem) => elem.Name).join(", ");
                            this.logger.warn(`   WARNING: You have more than one GeoPoint field in your ${type.Name} collection: ${locationFields}`);
                        }
                        return type;
                    })
                    .catch((locationFieldError) => {
                        return Promise.reject(locationFieldError);
                    })
            );
        }

        return utils.resolveAllPromises(promises);
    }

    getFileFields(types) {
        const promises = [];
        const headers = {};
        const filter = {DataType: 6};
        headers['x-everlive-filter'] = JSON.stringify(filter);

        for (const type of types) {
            const path = `/Types/${type.Id}/Fields`;

            promises.push(
                this.makeBSMetadataRequest('GET', path, headers)
                    .then((response) => {
                        if (response.Count > 0) {
                            type.fileFieldName = [];
                            for (let i = 0; i < response.Result.length; i++) {
                                type.fileFieldName.push(response.Result[i].Name);
                            }
                        }
                        return type;
                    })
                    .catch((fileFieldError) => {
                        return Promise.reject(fileFieldError);
                    })
            );
        }

        return utils.resolveAllPromises(promises);
    }


    getUsers() {
        let headers = {};
        headers['x-everlive-migrate'] = 'true';

        return this.makeBSMetadataRequest('GET', `/v1/${this.config.bs_app_id}/Users`, headers);
    }

    readItemsFromBS(type, skip, take) {
        const headers = {
            'Authorization': `masterkey ${this.config.bs_master_key}`,
            'x-everlive-migrate': true
        };
        const query = new Everlive.Query();
        query.order('CreatedAt');
        query.skip(skip).take(take);

        const dataStoreBS = Everlive.$.data(type.Name);
        return dataStoreBS.withHeaders(headers).get(query)
            .then((data) => {
                return this._formatLocationField(type, data);
            })
            .then((data) => {
                return this._formatFileFieldData(type, data);
            })
            .catch((queryError) => {
                return Promise.reject(queryError);
            });
    }

    getItemsCount(typeName) {
        const headers = {'Authorization': `masterkey ${this.config.bs_master_key}`};
        const dataStoreBS = Everlive.$.data(typeName);
        return dataStoreBS.withHeaders(headers).count()
            .then((result) => {
                return result.result;
            })
            .catch((queryError) => {
                return Promise.reject(queryError);
            });
    }

    makeBSMetadataRequest(method, path, headers) {
        headers = headers || {};
        headers['Authorization'] = `Masterkey ${this.config.bs_master_key}`;

        let actualPath;
        if (path.indexOf('/v1') > -1) {
            actualPath = path;
        } else {
            actualPath = `/v1/Metadata/Applications/${this.config.bs_app_id}${path}`;
        }

        const host = 'https://' + this.config.bs_host.concat(actualPath);
        const options = {
            method: method,
            uri: host,
            json: true,
            headers: headers
        };

        return utils.makeRequest(options);
    }

    getCloudFunctionsData(cloudFunctions) {
        const promises = [];
        let customEndpointTemplate = 'function onRequest(request, response, modules) ' +
            '{\n\t\tresponse.error(\'Not implemented yet!\');\n}\n\n';

        for (const cf of cloudFunctions) {
            const path = `/CloudFunctions/${cf.Id}/Code`;
            promises.push(
                this.makeBSMetadataRequest('GET', path)
            );
        }

        return utils.resolveAllPromises(promises);
    }

    getCloudHooksData(cloudHooks) {
        const promises = [];

        for (const ch of cloudHooks) {
            const path = `/Types/${ch.Id}/Code`;
            promises.push(
                this.makeBSMetadataRequest('GET', path)
            );
        }

        return utils.resolveAllPromises(promises);
    }

    getCloudHookData(cloudHookId) {
        const path = `/Types/${cloudHookId}/Code`;
        return this.makeBSMetadataRequest('GET', path)
            .catch((err) => Promise.resolve() );
    }

    _formatLocationField(type, typeData) {
        if (type.hasOwnProperty('locationFieldName')) {
            typeData.result.forEach((item) => {
                Object.keys(item).forEach((key) => {
                    if (key === type.locationFieldName) {
                        item._geoloc = item[key];
                        delete item[key];
                    }
                });
            });
        }
        return Promise.resolve(typeData);
    }

    _formatFileFieldData(type, typeData) {
        if (type.hasOwnProperty('fileFieldName')) {
            typeData.result.forEach((item) => {
                Object.keys(item).forEach((key) => {
                    for (let k = 0; k < type.fileFieldName.length; k++) {
                        if (key === type.fileFieldName[k]) {
                            item[key] = {
                                _type: 'KinveyFile',
                                _id: item[key]
                            }
                        }
                    }
                });
            });
        }

        return Promise.resolve(typeData.result);
    }
}

module.exports = BackendServicesApi;
