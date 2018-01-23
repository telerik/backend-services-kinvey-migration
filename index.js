'use strict';
const ConfigurationMigrator = require('./configurationMigrator');
const DataMigrator = require('./dataMigrator');
const utils = require('./utils');

const winston = require('winston');
const fs = require('fs');

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: true,
            formatter: formatter
        }),
        new (winston.transports.File)({
            filename: './migration-error.log',
            level: 'error'
        })
    ]
});

function formatter(args) {
    var logMessage = args.message;
    return logMessage;
}

let config;

try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (err) {
    console.error(new Error(err));
}

const operation = process.argv.slice(2, 3).toString();

if (operation === '--login') {
    utils.authenticateUser(logger, config);
} else {
    //Do not change those values. If you set them too high your API access will be automatically disabled.
    config.page_size_files = 50;
    config.page_size_data = 500;
    config.page_size_users = 50;
    config.max_parallel_requests = 10;
    config.bs_host = 'api.everlive.com';

    if (operation === '--migrate-config') {
        const configurationMigrator = new ConfigurationMigrator(logger, config);
        configurationMigrator.migrateConfiguration();
    } else if (operation === '--migrate-data') {
        const dataMigrator = new DataMigrator(logger, config);
        dataMigrator.migrateDataContent();
    } else if (operation === '--cleanup-dest') {
        const configurationMigrator = new ConfigurationMigrator(logger, config);
        configurationMigrator.cleanupDestinationApp();
    } else {
        logger.warn('Unrecognized command.' +
            '\n\nValid options are:' +
            '\n  --login - Initializes the Kinvey management authentication' +
            '\n  --migrate-config - Migrates the backend configuration of the app specified in config.json file' +
            '\n  --migrate-data - Migrates the data of the app specified in config.json file');
    }
}













