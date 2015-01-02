/* jshint node: true */
'use strict';

var path = require('path');

module.exports = {
  name: 'ember-cli-maven-deploy',
  includedCommands: function() {
    return {
      'deploy': require('./lib/commands/maven-deploy')
    };
  },
  blueprintsPath: function() {
    return path.join(__dirname, 'blueprints');
  }
};
