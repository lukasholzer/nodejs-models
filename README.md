# nodejs-models
Models for nodejs setup

For Koa2 Setup rendering Module hbs and the Storyblok Client


## hbs.js

usage in the base file.
adding the ctx.render function to the koa2 object

``` javascript

import Handlebars from './models/hbs';

app.hbs = new Handlebars();

const options = {
    viewsDir: config.templates.path,
    layoutsDir: config.templates.layouts,
    partialsDir: config.templates.partials,
    cache: app.env !== "development",
    defaultLayout: "main"
}

app.use(app.hbs.middleware(options));

```

## Storyblok.js

usage in the route

``` javascript

import { Storyblok } from '../models/Storyblok';

const options = {
  spaceId: process.env.STORYBLOK_SPACE_ID,
  token: process.env.STORYBLOK_TOKEN,
  token_public: process.env.STORYBLOK_TOKEN_PUBLIC
};

const client = new Storyblok(options);

await client.getStorys([{
    lang: lang,
    page: [page, 'global/footer/', 'global/header/', 'otherpages…'],
    querys: [
      { news: `starts_with=${lang}/folder/` }
    ],
    version: (storyblok) ? 'draft' : 'published'
  }]).then(async result => {
    await ctx.render('index', result);
  });

```
