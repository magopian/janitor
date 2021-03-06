// Copyright © 2017 Jan Keromnes. All rights reserved.
// The following code is covered by the AGPL-3.0 license.

const jsonpatch = require('fast-json-patch');
const selfapi = require('selfapi');

const configurations = require('../lib/configurations');
const db = require('../lib/db');
const log = require('../lib/log');
const machines = require('../lib/machines');
const users = require('../lib/users');

// API resource to manage a Janitor user.
const userAPI = module.exports = selfapi({
  title: 'User'
});

userAPI.get({
  title: 'Get the authenticated user',

  handler: (request, response) => {
    const { user } = request;
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    response.json(user.profile, null, 2);
  },

  examples: [{
    response: {
      body: JSON.stringify({ name: 'User Name' }, null, 2)
    }
  }]
});

userAPI.patch({
  title: 'Update the authenticated user',
  description: 'Update the user\'s profile information (with JSON Patch).',

  handler: (request, response) => {
    const { user } = request;
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    let json = '';
    request.on('data', chunk => {
      json += String(chunk);
    });
    request.on('end', () => {
      let operations = null;
      try {
        operations = JSON.parse(json);
      } catch (error) {
        response.statusCode = 400; // Bad Request
        response.json({ error: 'Problems parsing JSON' }, null, 2);
        return;
      }

      jsonpatch.applyPatch(user.profile, operations);
      db.save();

      response.json(user.profile, null, 2);
    });
  },

  examples: [{
    request: {
      body: JSON.stringify([
        { op: 'add', path: '/name', value: 'Different Name' }
      ], null, 2)
    },
    response: {
      body: JSON.stringify({ name: 'Different Name' }, null, 2)
    }
  }]
});

// API sub-resource to manage personal configuration files.
const configurationsAPI = userAPI.api('/configurations');

configurationsAPI.get({
  title: 'Get all user configurations',

  handler ({ user }, response) {
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    response.json(user.configurations, null, 2);
  },

  examples: [{
    response: {
      body: JSON.stringify({ '.gitconfig': '' }, null, 2)
    }
  }]
});

configurationsAPI.patch({
  title: 'Update user configurations',
  description: 'Update any user configuration file(s) (using JSON Patch).',

  handler (request, response) {
    const { user } = request;
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    let json = '';
    request.on('data', chunk => {
      json += String(chunk);
    });
    request.on('end', () => {
      let operations;
      try {
        operations = JSON.parse(json);
        const changedFiles = operations
          .map(operation => operation.path.replace(/^\//, ''));

        for (const file of changedFiles) {
          if (!configurations.allowed.includes(file)) {
            response.statusCode = 400; // Bad Request
            response.json({ error: 'Updating ' + file + ' is forbidden' }, null, 2);
            return;
          }
        }
      } catch (error) {
        response.statusCode = 400; // Bad Request
        response.json({ error: 'Problems parsing JSON' }, null, 2);
        return;
      }

      jsonpatch.applyPatch(user.configurations, operations);
      db.save();

      response.json(user.configurations, null, 2);
    });
  },

  examples: [{
    request: {
      body: JSON.stringify([
        { op: 'add', path: '/.gitconfig', value: '[user]\nname = Janitor' }
      ], null, 2)
    },
    response: {
      body: JSON.stringify({ '.gitconfig': '[user]\nname = Janitor'  }, null, 2)
    }
  }]
});

// API sub-resource to manage a single configuration file.
const configurationAPI = configurationsAPI.api('/:file');

configurationAPI.delete({
  title: 'Reset a user configuration',
  description: 'Reset a user configuration file to its default template value.',

  handler ({ user, query }, response) {
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    configurations.resetToDefault(user, query.file, error => {
      if (error) {
        response.statusCode = 500; // Internal Server Error
        response.json({ error: 'Could not reset configuration' }, null, 2);
        return;
      }

      response.statusCode = 204; // No Content
      response.end();
    });
  },

  examples: [{
    request: {
      urlParameters: { file: '.gitconfig' },
    }
  }]
});

configurationAPI.put({
  title: 'Deploy a user configuration',
  description:
    'Install or overwrite a configuration file in all the user\'s containers ' +
    '(any local changes will be lost!)',

  handler ({ user, query }, response) {
    if (!user) {
      response.statusCode = 403; // Forbidden
      response.json({ error: 'Unauthorized' }, null, 2);
      return;
    }

    const { file } = query;
    machines.deployConfigurationInAllContainers(user, file).then(count => {
      response.json({
        message: 'Successfully deployed to ' + count + ' container' +
          (count === 1 ? '' : 's')
      }, null, 2);
    }).catch(error => {
      log('[fail] could not deploy configuration file:', file, error);
      response.statusCode = 500; // Internal Server Error
      response.json({ error: 'Could not deploy configuration' }, null, 2);
    });
  },

  examples: [{
    request: {
      urlParameters: { file: '.gitconfig' },
    },
    response: {
      body: JSON.stringify({ message: 'Successfully deployed to 0 containers' }, null, 2)
    }
  }]
});
