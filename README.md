# webpack-alias-config-plugin

[Webpack](http://webpack.github.io) plugin that provides a convenience to override modules `require` paths, with an external set of matching files.

## Usage

``` js
// webpack.config.js
import WebpackAliasConfigPlugin from 'webpack-alias-config-plugin'

const webpackConfig = {
    plugins: [
        new WebpackAliasConfigPlugin({
            config: 'webpack.config.js',
            findConfig: true
        })
    ]
}

```

## Installation

Install via [npm](https://www.npmjs.com/package/webpack-alias-config-plugin):

``` js
npm install --save-dev webpack-alias-config-plugin
```

## Api

``` js
new WebpackAliasConfigPlugin({ config, findConfig, extensions })
```

- `config`(string): Path to your webpack config file.

    The plugin is going to look for a `webpack.config.js` file or a `webpack.config.babel.js` at the root, in case your webpack configuration file is in another location, you can use this option to provide an absolute or relative path to it. You can also use environment variable in this option, using [lodash template](https://lodash.com/docs#template), for example:
    ```javascript
    const webpackConfig = {
        plugins: [
            new WebpackAliasConfigPlugin({
                config: "${PWD}/webpack.config.test.js",
            })
        ]
    }
    ```
    And run with:
    ```console
    $ PWD=$(pwd) NODE_ENV=test ava
    ```

- `findConfig`(boolean): Will find the nearest webpack configuration file when set to `true`.

    It is possible to pass a findConfig option, and the plugin will attempt to find the nearest webpack configuration file within the project using [find-up](https://github.com/sindresorhus/find-up). For example:
    ```javascript
    const webpackConfig = {
        plugins: [
            new WebpackAliasConfigPlugin({
                config: "webpack.config.test.js",
                findConfig: true
            })
        ]
    }
    ```

* `extensions` _(optional)_ `array` of extensions to resolve against _(default: ['jsx', 'js'])_
