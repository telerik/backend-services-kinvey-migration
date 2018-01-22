'use strict';
const async = require('async');

const CollectionsMigrator = require('./collectionsMigrator');
const DataMigrator = require('./dataMigrator');
const FilesMigrator = require('./filesMigrator');
const UsersMigrator = require('./usersMigrator');
const utils = require('./utils');

const Kinvey = require('kinvey-node-sdk');
const Everlive = require('everlive-sdk');


function Migrator(options, arguments){
    this.options = options;
    this.collectionsMigrator = new CollectionsMigrator(options);
    this.filesMigrator = new FilesMigrator(options);
    this.dataMigrator = new DataMigrator(options);
    this.usersMigrator = new UsersMigrator(options);
}
Migrator.prototype.migrate = function(done){
    const tasks = [];
    const operation = process.argv.slice(2,3).toString();
    tasks.push(this._initializeKinvey.bind(this));
    tasks.push(this._initializeBS.bind(this));

    if (operation === this.options.migrate_config) {
        tasks.push(this.collectionsMigrator.migrateConfiguration.bind(this.collectionsMigrator));

    } else if(operation === this.options.migrate_data) {
        tasks.push(this.dataMigrator.migrateTypesData.bind(this.dataMigrator));
        tasks.push(this.filesMigrator.migrateFiles.bind(this.filesMigrator));
        tasks.push(this.usersMigrator.migrateUsers.bind(this.usersMigrator));

    } else {
        throw new Error('Invalid option');
    }
    
    async.series(tasks, function _allDone(error) {
        if (error) {
            return done(new Error(error));
        } else {
            done();
        }
    });
};


Migrator.prototype._initializeKinvey = function(done) {
    const self = this;
    Kinvey.initialize({
        appKey: self.options.kinvey_kid,
        masterSecret: self.options.kinvey_master_secret
    }).then(function(activeUser) {
        // let authHeader = 'Basic ' + utils.base64.encode(kinvey_kid + ":" + kinvey_master_secret);
        // if (!activeUser) {
        //     var promise = Kinvey.User.signup();
        //     return promise;
        // }
    }).then(function() {
        done();
    }).catch(function(error) {
        console.error(error);
    });
};

// Todo remove global references
Migrator.prototype._initializeBS = function(done) {
    const el = new Everlive(this.options.bs_app_id);
    done();
};


module.exports = Migrator;