const request = require('request-promise-native');
const prompt = require('prompt');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');

function Utils() {
}

Utils.makeRequest = function (options) {
    return request(options)
        .then((response) => {
            return response;
        })
        .catch((requestError) => {
            return Promise.reject(requestError);
        });
};

Utils.resolveAllPromises = function (promises) {
    return Promise.all(promises)
        .then((promiseResult) => {
            return promiseResult.filter((result) => {
                return typeof result !== 'undefined';
            });
        })
        .catch((promiseError) => {
            return Promise.reject(promiseError);
        });
};

Utils.convertCollectionNameToKinvey = function (collectionName) {
    var changedName = collectionName.replace(/([^a-z0-9\-]+)/gi, '-');
    var newCollectionName = changedName.replace(/(^group$)/i, 'Group-1');
    return newCollectionName;
};

Utils.authenticateUser = function (logger, config) {
    const requestUrl = `${config.kinvey_manage_host}/v2/session`;
    const schema = {
        properties: {
            name: {
                message: 'Enter your Kinvey username',
                required: true
            },
            password: {
                message: 'Enter your Kinvey password',
                hidden: true
            }
        }
    };

    prompt.start();

    prompt.get(schema, (error, result) => {
        if (error) {
            logger.error(error);
            throw error;
        }

        const options = {
            method: 'POST',
            uri: requestUrl,
            json: true,
            headers: {'Content-Type': 'application/json'},
            body: {email: result.name, password: result.password}
        };

        Utils.makeRequest(options)
            .then((result) => {
                return Utils.updateConfigToken(result.token, logger, config);
            })
            .then(() => {
                logger.info('Successfully configured Kinvey management authentication.');
            })
            .catch((authenticationError) => {
                logger.error('Initialization was not successful. An error occured while authenticating to Kinvey: ' + authenticationError.message);
            });
    });
};

Utils.updateConfigToken = function (token, logger, config) {
    config.kinvey_token = `Kinvey ${token}`;
    config = JSON.stringify(config, null, 2);

    return fs.writeFileAsync('./config.json', config)
        .then(() => {
            return Promise.resolve()
        })
        .catch((updateConfigError) => {
            logger.error(updateConfigError);
            return Promise.reject(updateConfigError);
        });
};

Utils.checkConfiguration = function(logger, config) {
    if (!config.bs_app_id || !config.bs_master_key) {
        return Promise.reject(new Error('Configuration not initialized properly. You must initialize the config.json file before running the migration.'));
    } else {
        return Promise.resolve();
    }
};

Utils.storeCloudFunction = function(appId, functionName, code) {
  let dirname = path.join(process.cwd(), appId, 'bl', 'functions');
  let filename = path.join(dirname, functionName + '.js');
  this.mkdirp(filename);
  fs.writeFileSync(filename, code);
};

Utils.storeHook = function(appId, typeName, code) {
  let dirname = path.join(process.cwd(), appId, 'bl', 'hooks');
  let filename = path.join(dirname, typeName + '.js');
  this.mkdirp(filename);
  fs.writeFileSync(filename, code);
};

Utils.storeMetadataCollection = function(appId, collectionName, data) {
  let dirname = path.join(process.cwd(), appId, 'metadata');
  let filename = path.join(dirname, collectionName + '.json');
  this.mkdirp(filename);
  fs.writeFileSync(filename, JSON.stringify(data));
};

Utils.storeDataCollection = function(appId, collectionName, data) {
  let dirname = path.join(process.cwd(), appId, 'data');
  let filename = path.join(dirname, collectionName + '.json');
  this.mkdirp(filename);
  fs.writeFileSync(filename, JSON.stringify(data));
};

Utils.storeJSON = function(filename, json) {
  this.mkdirp(filename);
  fs.writeFileSync(filename, JSON.stringify(json));
};

Utils.storeFile = function(filename, appId, fileBytes) {
    let dirname = path.join(process.cwd(), appId, 'files');
    let filepath = path.join(dirname, filename);
    this.mkdirp(filepath);
    fs.writeFileSync(filepath, fileBytes);
}

Utils.mkdirp = function(pathToFile) {
  pathToFile.split(path.sep).slice().reduce(function(prev, curr, i) {
    if (fs.existsSync(prev) === false) {
      fs.mkdirSync(prev);
    }
    return prev + path.sep + curr;
  });
}

module.exports = Utils;
