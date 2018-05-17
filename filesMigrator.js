const async = require('async');

const utils = require('./utils');
const config = require('./config');

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

                let dataArray = [];

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
                                    items.forEach(function(item) {
                                      dataArray.push(item);
                                    });
                                    self.insertFilesInKinvey(items, cb2);
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

                            utils.storeDataCollection(self.config.bs_app_id, 'Files', dataArray);

                            self.logger.info(`\tMigration completed. Files copied: ${copiedItemsCount}`);
                            resolve();
                        }
                    }
                );
            });
        });


    };

  insertFilesInKinvey(items, done) {
    const self = this;
    async.each(
      items,
      (item, callback) => {

        self.logger.info('\Downloading file: ' + item.Filename + ' (' + (item.Length / 1024) + ' KB)');

        async.series([
            (cb1) => {
              const options = {
                method: 'GET',
                uri: item.Uri,
                encoding: null
              };

              utils.makeRequest(options)
                .then((fileBytes) => {
                  utils.storeFile(item.Filename, config.bs_app_id, fileBytes);
                  cb1();
                })
                .catch((getFilesError) => {
                  cb1(getFilesError);
                });
            }
          ],
          callback
        );

      },
      done
    );
  }

}

module.exports = FilesMigrator;
