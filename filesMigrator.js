const async = require('async');

class FilesMigrator {
    constructor(bsApi, kinveyApi, logger, config) {
        this.logger = logger;
        this.config = config;
        this.backendservicesApi = bsApi;
        this.kinveyApi = kinveyApi;
    }

    migrateFiles() {
        return this.backendservicesApi.getItemsCount('Files')
        .then((filesCount) => {
            this.logger.info(`\nMigrating files...`);
            this.logger.info(`\tFiles found: ${filesCount}`);
            return new Promise((resolve, reject) => {
                const self = this;
                const pageSize = this.config.page_size_files;
                let pageIndex = 0;

                let fetchedItemsCount;
                let copiedItemsCount = 0;

                async.doUntil(
                    (callback) => {
                        async.waterfall([
                                (cb) => {
                                    let type = {Name: 'Files'};
                                    return self.backendservicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
                                        .then((result) => cb(null, result));
                                },
                                (items, cb2) => {
                                    fetchedItemsCount = items.length;
                                    self.kinveyApi.insertFilesInKinvey(items, cb2);
                                }
                            ],
                            callback
                        );
                    },
                    () => {
                        pageIndex++;
                        copiedItemsCount += fetchedItemsCount;
                        if (fetchedItemsCount < pageSize) {
                            return true;
                        } else {
                            self.logger.info(`\tProgress: ${copiedItemsCount} out of ${filesCount}`);
                            return false;
                        }
                    },
                    (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            self.logger.info(`\tMigration completed. Files copied: ${copiedItemsCount}`);
                            resolve();
                        }
                    }
                );
            });
        });


    };

}

module.exports = FilesMigrator;
