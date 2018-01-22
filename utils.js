const request = require('request-promise-native');
const prompt = require('prompt');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));

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
    return collectionName.replace(/([^a-z0-9\-]+)/gi, '-');
};

Utils.authenticateUser = function (logger, config) {
    const requestUrl = `${config.kinvey_manage_host}/v2/session`;
    const schema = {
        properties: {
            name: {
                message: 'Enter your Kinvey Username',
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
                logger.info('Successfully configured Migration tool');
            })
            .catch((authenticationError) => {
                logger.error(authenticationError);
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

module.exports = Utils;
