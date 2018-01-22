'use strict';

const utils = require('./utils.js');
const asyncp = require('async-p');

const BackEndServicesApi = require('./backendServicesApi');
const KinveyServiceApi = require('./kinveyServiceApi');

class ConfigurationMigrator {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.kinveyServiceApi = new KinveyServiceApi(this.logger, this.config);
        this.backendServicesApi = new BackEndServicesApi(this.logger, this.config);
    }

    migrateConfiguration() {
        new Promise((resolve, reject) => {resolve()})
            .then(() => {
                return this.kinveyServiceApi.checkManagementAuthorization();
            })
            .then(() => {
                return this.migrateTypes();
            })
            .then(() => {
                return this.migrateRoles();
            })
            .then(() => {
                return this.migrateCloudFunctions();
            })
            .then(() => {
                return this.migrateHooks();
            })
            .then(() => {
                this.logger.info('\nConfiguration migration completed.');
            })
            .catch((migrateConfigError) => {
                this.logger.error(migrateConfigError.message);
            });
    }

    cleanupDestinationApp() {
        this.logger.info('Cleaning up destination app...');
        new Promise((resolve, reject) => {resolve()})
        .then(() => {
                return this.cleanupTypes();
        })
        .then(() => {
            this.logger.info('Cleanup completed.');
        })
        .catch((migrateConfigError) => {
            this.logger.error(migrateConfigError.message, migrateConfigError);
        });
    }

    cleanupTypes() {
        const self = this;
        const readUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/collections`;
        const deleteUrl = `${self.config.kinvey_manage_host}/v2/environments/${self.config.kinvey_kid}/collections/`;
        const headers = {
            'Authorization': self.config.kinvey_token
        };

        return utils.makeRequest(
            {
                method: 'GET',
                uri: readUrl,
                json: true,
                headers: headers
            }
        ).then(function(response) {
            return asyncp.eachSeries(
                response,
                function(collection) {
                    const options = {
                        method: 'DELETE',
                        uri: deleteUrl + collection.name,
                        headers: headers
                    };
                    self.logger.info('  Deleting collection: ' + collection.name);
                    return utils.makeRequest(options);
                }
            );
        });
    }

    migrateTypes() {
        this.logger.info('\nMigrating content types (collections)...');
        return this.backendServicesApi.getTypes()
            .then((response) => {
                const contentTypes = response.Result;
                this.logger.info(`\t${contentTypes.length} collection(s) found.`);
                return this.kinveyServiceApi.createCollections(contentTypes);
            })
            .then((result) => {
                this.logger.info('\tContent types migrated successfully.');
            })
            .catch((migrateTypeError) => {
                return Promise.reject(migrateTypeError);
            });
    }

    migrateRoles() {
        this.logger.info('\nMigrating roles...');
        return this.backendServicesApi.getRoles()
            .then((rolesResponse) => {
                const roles = rolesResponse.Result;
                this.logger.info(`\t${roles.length} role(s) found.`);
                return this.kinveyServiceApi.createRoles(roles);
            })
            .then((result) => {
                this.logger.info('\tRoles migrated successfully.');
            })
            .catch((migrateRoleError) => {
                return Promise.reject(migrateRoleError);
            })
    }

    migrateCloudFunctions() {
        this.logger.info('\nMigrating cloud functions (custom endpoints) ...');
        let cloudFunctionsMeta;
        return this.backendServicesApi.getCloudFunctions()
            .then((cloudFunctionsResponse) => {
                cloudFunctionsMeta = cloudFunctionsResponse.Result;
                this.logger.info(`  ${cloudFunctionsMeta.length} cloud function(s) found.`);
                return this.backendServicesApi.getCloudFunctionsData(cloudFunctionsMeta);
            })
            .then((data) => {
                return this._formatEndpointsCode(cloudFunctionsMeta, data);
            })
            .then((formatedData) => {
                return this.kinveyServiceApi.createCustomEndpoints(formatedData);
            })
            .then((result) => {
                this.logger.info('\tCloud functions migrated successfully.');
            })
            .catch((cloudFuncError) => {
                return Promise.reject(cloudFuncError);
            });
    }

    migrateHooks() {
        let self = this;
        this.logger.info('\nMigrating cloud code for data (collection hooks)...');
        let cloudHooksDetails;
        return this.backendServicesApi.getCloudHookTypes()
            .then(function(types) {
                return asyncp.eachSeries(
                    types.Result,
                    self._migrateTypeHooks.bind(self)
                );
            })
            .then((result) => {
                this.logger.info('\tCloud code for data migrated successfully.');
            }
        );
    }

    _migrateTypeHooks(type) {
        let self = this;
        const collectionName = utils.convertCollectionNameToKinvey(type.Name);
        this.logger.info('\tMigrating hooks for content type: ' + collectionName);
        return this.backendServicesApi.getCloudHookData(type.Id)
        .then((hooksCode) => {
            if (!hooksCode) {
                this.logger.info('\t\tNo code for this content type.');
                return Promise.resolve();
            }

            let formattedHooksCode = self._formatHooksCode(hooksCode);
            let hooksToCreate = self._getHooksToCreate(hooksCode);

            return self.kinveyServiceApi._createCollectionHooks(collectionName, hooksToCreate, formattedHooksCode);
        })
        .then((result) => {
            this.logger.info('\t\tCloud hooks migrated successfully.');
        })
        .catch((err) => {
            this.logger.info(`\t\tError migrating hooks for type '${collectionName}'. Error: ${error}`);
            Promise.resolve();
        });
    }

    _getHooksToCreate(hooksCode) {
        const bsHookName = new RegExp(/^(\.\w*)/, 'g');
        const bsToKinveyHookMap = {
            'beforeCreate': 'pre-save',
            'beforeRead': 'pre-fetch',
            'beforeUpdate': 'pre-save',
            'beforeDelete': 'pre-delete',
            'afterCreate': 'post-save',
            'afterRead': 'post-fetch',
            'afterUpdate': 'post-save',
            'afterDelete': 'post-delete'
        };

        let hooks = [];
        const code = this._removeCommentsFromCode(hooksCode);
        const codeParts = code.split('Events').splice(1, code.length - 1);

        for (const codePart of codeParts) {
            const hookMatch = codePart.match(bsHookName).toString().replace('.', '');
            let kinveyHookName = bsToKinveyHookMap[hookMatch];

            if (kinveyHookName) {
                if (hooks.indexOf(kinveyHookName) === -1) {
                    hooks.push(kinveyHookName);
                }
            }
        }

        return hooks;
    }

    _formatEndpointsCode(endpointMeta, cloudFunctionData) {
        const formatedData = [];
        for (let i = 0; i < endpointMeta.length; i++) {
            const customEndpointTemplate = this._renderDefaultEndpointTemplate().concat(`/*\n${cloudFunctionData[i]}\n*/`);
            formatedData.push({ name: endpointMeta[i].Name, code: customEndpointTemplate });
        }

        return Promise.resolve(formatedData);
    }

    _renderDefaultEndpointTemplate() {
        let customEndpointTemplate = 'function onRequest(request, response, modules) ' +
            '{\n\t\tresponse.error(\'Not implemented yet!\');\n}\n\n';

        return customEndpointTemplate;
    }

    _formatHooksCode(codeMultilineString) {
        const regex = /^(.*)$/gm;
        const replacedString = codeMultilineString.replace(regex, "//\t$1").trim();
        return '\n\n//MIGRATED FROM TELERIK PLATFORM\n//\n' + replacedString;
    }

     _removeCommentsFromCode(code) {
         const formatHookCode = new RegExp(/\/\*(\*(?!\/)|[^*])*\*\//, 'g');
         let activeCode = code.replace(formatHookCode, '').replace(/\/\/.*/g, '').trim();
         return activeCode;
     };


}

module.exports = ConfigurationMigrator;
