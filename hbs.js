import fs from 'fs';
import path from 'path';
import glob from 'glob';
import forIn from 'for-in';
import handlebars from 'handlebars';
import requireDir from 'require-dir';

/**
 * Shallow copy two objects into a new object
 *
 * Objects are merged from left to right. Thus, properties in objects further
 * to the right are preferred over those on the left.
 *
 * @param {object} obj1
 * @param {object} obj2
 * @returns {object}
 */

const merge = (obj1, obj2) => {
    const c = {};
    let keys = Object.keys(obj2);
    for (var i = 0; i !== keys.length; i++) {
        c[keys[i]] = obj2[keys[i]];
    }

    keys = Object.keys(obj1);
    for (i = 0; i !== keys.length; i++) {
        if (!c.hasOwnProperty(keys[i])) {
            c[keys[i]] = obj1[keys[i]];
        }
    }

    return c;
};


/* Capture the layout name; thanks express-hbs */
const rLayoutPattern = /{{!<\s+([A-Za-z0-9\._\-\/]+)\s*}}/;

class Hbs {

    /**
     * Creates an instance of Hbs.
     */
    constructor() {
        if (!(this instanceof Hbs)) {
            return new Hbs();
        }

        this.handlebars = handlebars.create();
        this.Utils = this.handlebars.Utils;
        this.SafeString = this.handlebars.SafeString;
    }

    /**
     * Configuration for the Environment
     * @param {Object} options - The Object with the options
     * @param {String} options.viewsDir
     * @param {String} options.PartialsDir
     * @param {String} options.layoutsDir
     * @param {String} options.defaultLayout
     * @param {String} options.extname -  Extension name of the files
     * @param {Object} options.handlebars - Handlebars npm Module
     */
    configure(options) {

        if (!options.viewsDir) {
            throw new Error('must specify view path');
        }

        options = options || {};
        this.viewsDir = options.viewsDir;
        this.layoutsDir = options.layoutsDir || '';
        this.partialsDir = options.partialsDir || [];
        this.extname = options.extname || '.hbs';
        this.handlebars = options.handlebars || this.handlebars;
        this.defaultLayout = options.defaultLayout || 'main';
        this.defaultView = options.defaultView || 'index';
        this.locals = options.locals || {};

        this.partialsRegistered = false;

        this.disableCache = options.disableCache || true;

        // handlebars.compile(options) -> take a look at the official handlebars page
        this.compilerOptions = null;

        // Cache templates and layouts
        this.cache = {};

        // Private internal file system cache
        this._fsCache = {};

        // if (!Array.isArray(this.viewsDir)) {
        //     this.viewsDir = [this.viewsDir];
        // }

        this._registerHelpers();
    }


    /**
     * Is the Middleware for Koa2
     * adding the render function to the ctx Object
     *
     * @param {any} options
     * @returns async(ctx, next) - for the middleware function requirements
     */
    middleware(options) {
        this.configure(options);

        const render = this.render();

        return async(ctx, next) => {
            ctx.render = render;
            await next();
        };
    }

    render() {

        let _self = this;

        return async function(tpl, locals, options) {
            const layout = (options.layout) ? options.layout : _self.defaultLayout;
            const tplPath = _self._getTemplatePath(tpl)
            const layPath = _self._getLayoutPath(layout);
            let template;
            let rawTemplate;
            let layoutTemplate;


            locals = merge(this.state || {}, locals || {});
            locals = merge(_self.locals, locals);

            // Register all Partials
            if (!_self.partialsRegistered && _self.partialsDir !== '') {
                await _self._registerPartials();
            }

            if (!_self.cache[tpl]) {
                rawTemplate = await _self._loadFile(tplPath);

                // cache the template
                _self.cache[tpl] = {
                    template: _self._compileTemplate(rawTemplate)
                };

                // Check layout with regex in template
                if (rLayoutPattern.test(rawTemplate)) {
                    const layout = rLayoutPattern.exec(rawTemplate)[1];
                    const rawLayout = await _self._loadFile(layPath);
                    _self.cache[tpl].layoutTemplate = _self._compileTemplate(rawLayout);
                }
            }

            template = _self.cache[tpl].template;
            layoutTemplate = _self.cache[tpl].layoutTemplate;


            if (!layoutTemplate) {
                // layoutTemplate = await hbs.getLayoutTemplate();

                const rawLayout = await _self._loadFile(layPath);
                layoutTemplate = _self._compileTemplate(rawLayout);
            }

            //   // Add the current koa context to templateOptions.data to provide access
            //   // to the request within helpers.
            //   if (!hbs.templateOptions.data) {
            //     hbs.templateOptions.data = {};
            //   }

            //   hbs.templateOptions.data = merge(hbs.templateOptions.data, { koa: this });

            locals.body = template(locals, _self.templateOptions);
            this.body = layoutTemplate(locals, _self.templateOptions);
        }
    }

    _getTemplatePath(template = null) {
        if (template) {
            return path.join(this.viewsDir, template + this.extname);
        }
        return path.join(this.viewsDir, this.defaultView + this.extname);
    }
    _getLayoutPath(layout = null) {
        if (layout) {
            return path.join(this.layoutsDir, layout + this.extname);
        }
        return path.join(this.layoutsDir, this.defaultLayout + this.extname);
    }

    /**
     * Register all Partials over the I/O
     */
    async _registerPartials() {
        try {
            const glob = path.join(this.partialsDir, '**/*' + this.extname);
            let files = await this._globFiles(glob);
            let names = [];
            let partials = [];

            if (!files.length) {
                return;
            }

            for (let i = 0, max = files.length; i < max; i++) {
                const content = await this._loadFile(files[i]);
                const name = files[i].replace(this.partialsDir + '/', '').slice(0, -1 * this.extname.length);

                this._registerPartial(name, content);
            }

            this.partialsRegistered = true;
        } catch (error) {
            console.error('Error caught while registering partials');
            console.error(error);
        }
    }



    _registerHelpers() {
      const base = requireDir('../lib/basehelpers', { recurse: false });
      const specific = requireDir('../lib/helpers', { recurse: false });
      const helpers = merge(base, specific);

        this.handlebars.registerHelper({
            'partial': function (name) {
                return name;
            }
        });

        forIn(helpers, (group, key) => {
            this.handlebars.registerHelper(key, group);
        });
    }

    /**
     * Glob all the Files and return an promise wich resolves an array
     *
     * @param {String} globPath – is a globbing path: *.js
     * @returns a Promise with the filepaths in an array
     */
    _globFiles(globPath) {
        return new Promise(resolve => {
            glob(globPath, {}, function(err, files) {
                if (err) {
                    console.error(err)
                }
                resolve(files)
            });
        });
    }


    /**
     * File loading function in ES7 -> Damn!
     */
    async _loadFile(filePath) {
        let file = await this._readFileAsync(filePath);
        return file;
    }

    /**
     * Promise wrapped I/O File reading with Nodes fs.readFile
     *
     * @param {string} file – The filename to read
     * @returns a Promise wich resolves the data
     */
    _readFileAsync(file) {
        return new Promise(resolve => {
            fs.readFile(file, 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                }
                resolve(data);
            });
        });
    }

    /**
     * Wrap the Handlebars compile function
     * Maybe I want to extend this later so I wrap it in a function
     */
    _compileTemplate(template, options = {}) {
        return this.handlebars.compile(template, options);
    }

    /**
     * Register helper to internal handlebars instance
     */
    _registerHelper() {
        this.handlebars.registerHelper(...arguments);
    }

    /**
     * Register partial with internal handlebars instance
     */
    _registerPartial() {
        this.handlebars.registerPartial(...arguments);
    }
}


// export default asyncClass.wrap(Hbs);
export default Hbs;
