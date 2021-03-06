/* jshint node:true */

'use strict';
var fs = require('fs');
var path = require('path');
var JSZip = require('jszip');
var walk = require('fs-walk');
var exec = require('child_process').exec;
var Promise = require('rsvp').Promise;
var isBinaryFile = require('isbinaryfile');
var extend = require('util-extend');

var defaults = {
  artifactId: '{{name}}',
  buildDir: 'dist',
  fileName: '{{name}}',
  type: 'zip',
  fileEncoding: 'utf-8'
};

function getProjectFile() {
  return JSON.parse(fs.readFileSync('./package.json', { encoding: defaults.fileEncoding }));;
}

function filterOptions(options) {
  var opts = options;
  var project = getProjectFile();
  var test = /{{([^}]+)}}/g;

  function replaceOption(match, key) {
    if(project[key] === undefined) {
      return match;
    }

    return project[key];
  }

  Object.keys(opts).forEach(function(key) {
    var val = opts[key];
    if(typeof val !== 'string') {
      return;
    }

    opts[key] = val.replace(test, replaceOption);
  });

  return opts;
}

function configure(options) {
  var config = extend(defaults, options);
  var filteredOptions = filterOptions(config);
  return filteredOptions;
}

function execCommand(command) {
  console.log('Executing command:', command);

  return new Promise(function(resolve, reject) {
    exec(command, function(err, stdout) {
      if(err) {
        reject(err);
      }
      resolve(stdout);
    });
  });
}

function buildMavenArgs(options, repositoryId, isSnapshot) {
  var mavenArgs = {
    packaging: options.type,
    groupId: options.groupId,
    artifactId: options.artifactId,
    version: options.version
  };

  if(repositoryId) {
    var repositories = options.repositories;
    var repoCount = repositories.length;

    for(var i = 0; i < repoCount; i++) {
      var currentRepo = repositories[i];

      if(currentRepo.id !== repositoryId) {
        continue;
      }

      mavenArgs.repositoryId = currentRepo.id;
      mavenArgs.url = currentRepo.url;
    }
  }

  if(options.postfix.length) {
    mavenArgs.artifactId = mavenArgs.artifactId + '_' + options.postfix;
  }

  if(isSnapshot) {
    mavenArgs.version = mavenArgs.version + '-SNAPSHOT';
  }

  mavenArgs.file = destPath(options, isSnapshot);

  return Object.keys(mavenArgs).reduce(function(arr, key) {
    return arr.concat('-D' + key + '=' + mavenArgs[key]);
  }, []);
}

function mavenExec(args, options, repositoryId, isSnapshot) {
  var cmdArgs = args.concat(buildMavenArgs(options, repositoryId, isSnapshot)).join(' ');
  return execCommand('mvn -B ' + cmdArgs);
}

function destPath(options, isSnapshot) {
  var fileName = '';
  var file = [options.fileName];

  if(options.postfix.length) {
    file.push('_' + options.postfix);
  }

  file.push('-' + options.version);

  if(isSnapshot) {
    file.push('-SNAPSHOT');
  }

  file.push('.' + options.type);

  fileName = file.join('');

  return path.join(options.buildDir, fileName);
}

function buildDeploymentPackage(options, isSnapshot) {
  var config = options;
  var zip = new JSZip();

  walk.walkSync(config.buildDir, function(base, file, stat) {
    if(stat.isDirectory()) {
      return;
    }

    var filePath = path.join(base, file);
    var data;

    if(isBinaryFile(filePath)) {
      data = fs.readFileSync(filePath);
    } else {
      data = fs.readFileSync(filePath, { encoding: config.fileEncoding });
    }

    zip.file(path.relative(config.buildDir, filePath), data);
  });

  var zipBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE'});
  var zipPath = destPath(config, isSnapshot);

  fs.writeFileSync(zipPath, zipBuffer);
}

function deploy(repositoryId, isSnapshot, options) {
  var config = configure(options);

  if(!config.repositories.length) {
    throw new Error('You need to have at least one maven repository configured');
  }

  buildDeploymentPackage(config, isSnapshot);

  return mavenExec(['deploy:deploy-file'], config, repositoryId, isSnapshot);
}

module.exports = {
  package: function(options, isSnapshot) {
    buildDeploymentPackage(options, isSnapshot);
  },
  deploy: function(repositoryId, isSnapshot, options) {
    deploy(repositoryId, isSnapshot, options);
  }
};
