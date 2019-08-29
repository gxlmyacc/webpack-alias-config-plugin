/* eslint-disable consistent-return */
import path from 'path';
import fs from 'fs';
import template from 'lodash.template';
import some from 'lodash.some';
import findUp from 'find-up';

const resolutionCacheMap = {};

const DEFAULT_CONFIG_NAMES = [
  'alias.config.js',
  'app.config.js',
  'webpack.config.js',
  'webpack.config.babel.js'
];

function fileExists(path) {
  try {
    return !fs.accessSync(path, fs.F_OK);
  } catch (e) {
    return false;
  }
}

function getConfigPath(filename, configPaths, findConfig) {
  let conf = null;

  // Try all config paths and return for the first found one
  some(configPaths, configPath => {
    if (!configPath) return false;

    // Compile config using environment variables
    const compiledConfigPath = template(configPath)(process.env);

    let resolvedConfigPath;
    if (!findConfig) {
      // Get webpack config
      resolvedConfigPath = path.resolve(process.cwd(), compiledConfigPath);
    } else {
      resolvedConfigPath = findUp.sync(compiledConfigPath, {
        cwd: path.dirname(filename),
        type: 'file'
      });
    }

    if (resolvedConfigPath && fileExists(resolvedConfigPath)) {
      conf = resolvedConfigPath;
    }

    return conf;
  });

  return conf;
}

const cached = {};

class WebpackAliasConfigPlugin {
  /**
   * @param config
   * @param findConfig
   * @param exts
   * @constructor
   */
  constructor({
    config: configPaths,
    findConfig = false,
    extensions
  }) {
    this.configPaths = configPaths ? [configPaths, ...DEFAULT_CONFIG_NAMES] : DEFAULT_CONFIG_NAMES;
    this.findConfig = findConfig;
    this.extensions = extensions || ['.jsx', '.js', '.json', '.css', '.scss', '.less'];
  }

  apply(resolver) {
    const { configPaths } = this;
    const { findConfig } = this;
    const { extensions } = this;

    resolver.plugin('normal-module-factory', (nmf) => {
      nmf.plugin('before-resolve', (result, callback) => {
        if (!result) return callback();

        const filename = result.request;

        // if it already has been resolved and cached return it
        if (resolutionCacheMap[filename]) {
          result.request = resolutionCacheMap[filename];
          return callback(null, result);
        }

        // Get webpack config
        const confPath = getConfigPath(filename, configPaths, findConfig);

        // If the config comes back as null, we didn't find it, so throw an exception.
        if (!confPath) {
          throw new Error(
            `Cannot find any of these configuration files: ${configPaths.join(
              ', '
            )}`
          );
        }
        // Because of babel-register, babel is actually run on webpack config files using themselves
        // as config, leading to odd errors
        if (filename === path.resolve(confPath)) return;

        let aliasConf;
        let extensionsConf;
        let cwd;
        let aliases;

        let cache = cached[confPath];
        if (cache) {
          if (!cache.conf) return;
          if (cache.error) throw cache.error;

          // eslint-disable-next-line
          aliasConf = cache.aliasConf;
          // eslint-disable-next-line
          extensionsConf = cache.extensionsConf;
          // eslint-disable-next-line
          cwd = cache.cwd;
          // eslint-disable-next-line
          aliases = cache.aliases;
        } else {
          // Require the config
          let conf = require(confPath);

          // if the object is empty, we might be in a dependency of the config - bail without warning
          if (!Object.keys(conf).length) {
            return;
          }

          cwd = path.dirname(confPath);

          cache = { conf, cwd };
          cached[confPath] = cache;

          // In the case the webpack config is an es6 config, we need to get the default
          // eslint-disable-next-line
          if (conf && conf.__esModule && conf.default) {
            conf = conf.default;
          }

          // exit if there's no alias config and the config is not an array
          if (
            !conf.alias
            && !(conf.resolve && conf.resolve.alias)
            && !Array.isArray(conf)
          ) {
            cache.error = new Error(
              "The resolved config file doesn't contain a resolve configuration"
            );
            throw cache.error;
          }

          // Get the webpack alias config

          if (Array.isArray(conf)) {
            // the exported webpack config is an array ...
            // (i.e., the project is using webpack's multicompile feature) ...

            // reduce the configs to a single alias object
            aliasConf = conf.reduce((prev, curr) => {
              const next = Object.assign({}, prev);
              const alias = curr.alias || (curr.resolve && curr.resolve.alias);
              if (alias) {
                Object.assign(next, alias);
              }
              return next;
            }, {});

            // if the object is empty, bail
            if (!Object.keys(aliasConf).length) {
              return;
            }

            // reduce the configs to a single extensions array
            extensionsConf = conf.reduce((prev, curr) => {
              const next = [].concat(prev);
              const extensions = curr.extensions
                || (curr.resolve && curr.resolve.extensions)
                || [];
              if (extensions.length) {
                extensions.forEach(ext => {
                  if (next.indexOf(ext) === -1) {
                    next.push(ext);
                  }
                });
              }
              return next;
            }, []);

            if (!extensionsConf.length) extensionsConf = extensions;
          } else {
            // the exported webpack config is a single object...

            // use it's resolve.alias property
            aliasConf = conf.alias || (conf.resolve && conf.resolve.alias);

            // use it's resolve.extensions property, if available
            extensionsConf = conf.extensions
              || (conf.resolve && conf.resolve.extensions)
              || [];
            if (!extensionsConf) extensionsConf = extensions;
          }

          cache.aliases = Object.keys(aliasConf);
          cache.aliasConf = aliasConf;
          cache.extensionsConf = extensionsConf;
        }

        const filenames = filename.split('/');
        const moduleName = filenames[0];
        const aliasIndex = aliases.indexOf(moduleName);

        if (aliasIndex < 0) {
          return callback(null, result);
        }

        filenames[0] = aliasConf[aliases[aliasIndex]];
        const newFilePath = filenames.join('/');

        if (fileExists(newFilePath)) {
          resolutionCacheMap[result.request] = newFilePath;
          result.request = newFilePath;
          return callback(null, result);
        } else {
          const fileExtension = path.extname(newFilePath);

          // if the module doesn't have an extension, append the extension and check for it
          if (!fileExtension) {
            let foundFile = false;
            extensionsConf.forEach((extension) => {
              const newFilePathWithExt = `${newFilePath}${extension}`;
              if (!foundFile && fs.existsSync(newFilePathWithExt)) {
                foundFile = true;
                resolutionCacheMap[result.request] = newFilePathWithExt;
                result.request = newFilePathWithExt;
                return callback(null, result);
              }
            });
            if (!foundFile) {
              return callback(null, result);
            }
          } else {
            return callback(null, result);
          }
        }
      });
    });
  }
}

module.exports = WebpackAliasConfigPlugin;
