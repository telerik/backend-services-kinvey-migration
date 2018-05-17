const Promise = require('bluebird');
const async = require('async');
const _ = require('underscore');
const utils = require('./utils');

class UserMigrator {
    constructor(bsApi, kinveyApi, logger, config) {
        this.backendServicesApi = bsApi;
        this.kinveyServiceApi = kinveyApi;
        this.logger = logger;
        this.config = config;
    }

    migrateUsers(kinveyRoles, bsRoles) {
        return this._migrateUsers(kinveyRoles, bsRoles)
            .then(() => {
                return Promise.resolve();
            })
            .catch((migrateUsersError) => {
                return Promise.reject(migrateUsersError);
            });
    }

    _migrateUsers(kinveyRoles, bsRoles) {
        let self = this;

        const pageSize = this.config.page_size_users;

        let pageIndex = 0;

        let fetchedUsersCount;
        let copiedUsersCount = 0;
        let announcedItemsCount = 0;

      let dataArray = [];

        return this.backendServicesApi.getItemsCount('Users')
            .then((usersCount) => {
                this.logger.info('\nMigrating users...');
                this.logger.info(`\tUsers found: ${usersCount}`);

                return new Promise((resolve, reject) => {
                    async.doUntil(
                        (cb) => {
                            let type = {Name: 'Users'};
                            this.backendServicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
                                .then((users) => {
                                    fetchedUsersCount = users.length;
                                      users.forEach(function(item) {
                                      dataArray.push(item);
                                    });
                                })
                                .then(() => {
                                    cb()
                                })
                                .catch((migrateUsersError) => {
                                    reject(migrateUsersError);
                                });
                        },
                        () => {
                            pageIndex++;
                            copiedUsersCount += fetchedUsersCount;

                            if (copiedUsersCount > announcedItemsCount) {
                                self.logger.info(`\tProgress: ${copiedUsersCount} out of ${usersCount}`);
                                announcedItemsCount += 100;
                            }
                            if (fetchedUsersCount < pageSize) {
                                return true;
                            } else {
                                return false;
                            }
                        },
                        (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                utils.storeDataCollection(self.config.bs_app_id, 'Users', dataArray);
                                self.logger.info(`\tUser migration completed. Users migrated: ${copiedUsersCount}`);
                                resolve();
                            }
                        }
                    );
                });
            })
    }

}

module.exports = UserMigrator;
