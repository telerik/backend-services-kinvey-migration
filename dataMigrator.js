'use strict';

const BackEndServicesApi = require('./backendServicesApi');
const KinveyServiceApi = require('./kinveyServiceApi');
const FilesMigrator = require('./filesMigrator');
const utils = require('./utils');
const UsersMigrator = require('./usersMigrator');
const config = require('./config');

const async = require('async');
const Promise = require('bluebird');

class DataMigrator {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.backendServicesApi = new BackEndServicesApi(this.logger, this.config);
        this.filesMigrator = new FilesMigrator(this.backendServicesApi, this.kinveyServiceApi, this.logger, this.config);
        this.usersMigrator = new UsersMigrator(this.backendServicesApi, this.kinveyServiceApi, this.logger, this.config);
    }

    migrateDataContent() {
        let typesMetaData;
        let kinveyRoles = {};
        let bsRoles = {};
        return new Promise((resolve, reject) => {resolve()})
            .then(() => {
                return utils.checkConfiguration(this.logger, this.config);
            })
            .then(() => {
                return this.backendServicesApi.getTypes();
            })
            .then((types) => {
                typesMetaData = types.Result;
                return this.backendServicesApi.getRoles();
            })
//            .then(() => {
//                return this._migrateTypes(typesMetaData, kinveyRoles, bsRoles);
//            })
//            .then(() => {
//                return this.filesMigrator.migrateFiles();
//            })
//            .then(() => {
//                return this.usersMigrator.migrateUsers(kinveyRoles, bsRoles);
//            })
            .then(() => {
              return this._migratePushDevices();
            })
            .then(() => {
              return this._migratePushNotifications();
            })
            .then(() => {
                this.logger.info('\nData migration completed.');
            })
            .catch((dataMigrationError) => {
                this.logger.error(JSON.stringify(dataMigrationError));
            });
    }

    _migrateTypes(types) {
        return Promise.mapSeries(types, (type) => {
            return this._migrateSingleType(type);
        });
    }

    _migratePushNotifications() {
      const self = this;
      const pageSize = self.config.page_size_data;
      let pageIndex = 0;

      let fetchedItemsCount;
      let copiedItemsCount = 0;
      let announcedItemsCount = 0;

      this.logger.info(`\nMigrating push notifications...`);
      let type = {Name: 'Push/Notifications'};
      let dataArray = [];


          return new Promise((resolve, reject) => {
            async.doUntil(
              (cb) => {
                this.backendServicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
                  .then((items) => {
                    fetchedItemsCount = items.length;
                    items.forEach(function(item) {
                      dataArray.push(item);
                    });
                    cb();
                  })
                  .catch((error) => {
                    reject(error);
                  });
              },
              function () {
                pageIndex++;
                copiedItemsCount += fetchedItemsCount;
                if (copiedItemsCount > announcedItemsCount) {
                  self.logger.info(`\tProgress: ${copiedItemsCount}`);
                  announcedItemsCount += 100;
                }
                if (fetchedItemsCount < pageSize) {
                  return true;
                } else {
                  return false;
                }
              },
              function (err) {
                if (err) {
                  reject(err);
                } else {
                  utils.storeDataCollection(self.config.bs_app_id, 'PushNotifications', dataArray);
                  self.logger.info(`\tMigration completed. Items migrated: ${copiedItemsCount}`);
                  resolve();
                }
              }
            );
          });
    }

    _migratePushDevices() {
      const self = this;
      const pageSize = self.config.page_size_data;
      let pageIndex = 0;

      let fetchedItemsCount;
      let copiedItemsCount = 0;
      let announcedItemsCount = 0;

      this.logger.info(`\nMigrating push devices...`);
      let type = {Name: 'Push/Devices'};
      let dataArray = [];


      return new Promise((resolve, reject) => {
        async.doUntil(
          (cb) => {
            this.backendServicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
              .then((items) => {
                fetchedItemsCount = items.length;
                items.forEach(function(item) {
                  dataArray.push(item);
                });
                cb();
              })
              .catch((error) => {
                reject(error);
              });
          },
          function () {
            pageIndex++;
            copiedItemsCount += fetchedItemsCount;
            if (copiedItemsCount > announcedItemsCount) {
              self.logger.info(`\tProgress: ${copiedItemsCount}`);
              announcedItemsCount += 100;
            }
            if (fetchedItemsCount < pageSize) {
              return true;
            } else {
              return false;
            }
          },
          function (err) {
            if (err) {
              reject(err);
            } else {
              utils.storeDataCollection(self.config.bs_app_id, 'PushDevices', dataArray);
              self.logger.info(`\tMigration completed. Items migrated: ${copiedItemsCount}`);
              resolve();
            }
          }
        );
      });
    }

    _migrateSingleType(type) {
        const self = this;
        const pageSize = self.config.page_size_data;
        let pageIndex = 0;

        let fetchedItemsCount;
        let copiedItemsCount = 0;
        let announcedItemsCount = 0;

        this.logger.info(`\nMigrating collection ${type.Name}...`);

        let dataArray = [];

        return this.backendServicesApi.getItemsCount(type.Name)
        .then((itemsCount) => {
            self.logger.info(`\tItems found: ${itemsCount}`);
            return new Promise((resolve, reject) => {
                async.doUntil(
                    (cb) => {
                        const collectionName = utils.convertCollectionNameToKinvey(type.Name);
                        if (collectionName !== type.Name) {
                            self.logger.warn(`  WARNING: Invalid collection name. Migrating items to "${collectionName}" instead`);
                        }
                        this.backendServicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
                            .then((items) => {
                                fetchedItemsCount = items.length;
                                items.forEach(function(item) {
                                  dataArray.push(item);
                                });
                            })
                            .then(() => {
                                cb();
                            })
                            .catch((error) => {
                                reject(error);
                            });
                    },
                    function () {
                        pageIndex++;
                        copiedItemsCount += fetchedItemsCount;
                        if (copiedItemsCount > announcedItemsCount) {
                            self.logger.info(`\tProgress: ${copiedItemsCount} out of ${itemsCount}`);
                            announcedItemsCount += 100;
                        }
                        if (fetchedItemsCount < pageSize) {
                            return true;
                        } else {
                            return false;
                        }
                    },
                    function (err) {
                        if (err) {
                            reject(err);
                        } else {
                            utils.storeDataCollection(self.config.bs_app_id, type.Name, dataArray);
                            self.logger.info(`\tMigration completed. Items migrated: ${copiedItemsCount}`);
                            resolve();
                        }
                    }
                );
            });
        });

    }
}

module.exports = DataMigrator;
