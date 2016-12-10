import cache from 'memory-cache';
import request from 'request';
import colors from 'colors';

import app from '../app';

export class Storyblok {

  constructor(options) {
    this.spaceId = options.spaceId;
    this.token = options.token;
    this.token_public = options.token_public;
    this.version = 'published';
  }

  request(url, version = this.version) {
    return new Promise((resolve, reject) => {

      const options = {
        url: url,
        qs: {
          token: this.token,
          version: version
        },
        headers: {
          'User-Agent': 'nodejs'
        }
      };

      const res = cache.get(url);

      if (!res || version === 'draft') {

        request(options, function (error, response, body) {
          if (error) {
            console.error(`\`-[Storyblok] \t --> ${error}`.red);
            reject(404);
          } else if (response.statusCode === 401) {
            console.error(`\`-[Storyblok]--> Unauthorized to access: ${url}`.yellow);
            reject(401);
          } else if (response.statusCode !== 200) {
            console.error(`\`-[Storyblok]--> Unknown status Code: ${response.statusCode}: ${url}`.red);
            reject(response.statusCode);
          } else {
            cache.put(url, JSON.parse(body));
            resolve(JSON.parse(body));
          }
        });
      } else {
        resolve(res);
      }
    });
  }

  getStory(url) {
    return new Promise((resolve, reject) => {
      this.request(url, this.version)
        .then(result => {
          resolve(result);
        }).catch(statusCode => {
          reject(statusCode);
        });
    });
  }


  addPagesToPromiseStack(array, promiseStack) {
    if(!array) {
      return promiseStack;
    }
    if (!Array.isArray(array)) {
      const url = `https://api.storyblok.com/v1/cdn/${this.lang}/${array}`;
      promiseStack.push(this.getStory(url));
    } else {
      for (let j = 0, maxj = array.length; j < maxj; j++) {
        const url = `https://api.storyblok.com/v1/cdn/stories/${this.lang}/${array[j]}`;
        promiseStack.push(this.getStory(url));
      }
    }

    return promiseStack;
  }

  // get stories with -> Storyblok querys with getStoryAPI
  addCollectionsToPromiseStack(array, promiseStack) {
    if (!array) {
      return promiseStack;
    }

    for (let j = 0, maxj = array.length; j < maxj; j++) {
      let key = Object.keys(array[j])[0];
      const url = `http://api.storyblok.com/v1/cdn/stories?${array[j][key]}`;
      promiseStack.push(this.getStory(url));
    }

    return promiseStack;
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * @parameters:
   * {
   *  lang: String
   *  page: Array<String> | String
   * }
   *  - datas [{lang: '', page: ''}, …]
   * */
  getStorys(datas) {
    this.lang = datas[0].lang;
    this.version = datas[0].version; // get the version for storyblok

    return new Promise((resolve, reject) => {
      let promiseStack = [];
      let resultstack = [];
      let url = `http://api.storyblok.com/v1/cdn/spaces/${this.spaceId}/links`;

      promiseStack.push(this.getStory(url));

      for (let i = 0, max = datas.length; i < max; i++) {
        let data = datas[i];

        promiseStack = this.addPagesToPromiseStack(data.page, promiseStack); // add pages
        promiseStack = this.addPagesToPromiseStack(data.global, promiseStack); // add globals
        promiseStack = this.addCollectionsToPromiseStack(data.querys, promiseStack); // add collections
      }

      Promise.all(promiseStack)
        .then(result => {
          let z = {};
          for (let i = 0, max = result.length; i < max; i++) {
            if (result[i] || typeof (result[i]) === 'object') {

              if (result[i].links) {
                z.links = result[i].links;
              } else if (result[i].story) {
                if (result[i].story.full_slug === this.lang + '/' + app.page) {
                  console.log(`[Storyblok.js] -> fetched stories: ${result[i].story.slug}`.cyan);
                  z.story = result[i].story;
                } else {
                  console.log(`[Storyblok.js] -> fetched stories: ${result[i].story.slug}`.cyan);
                  z[result[i].story.slug] = result[i];
                }
              } else if (result[i].stories) {
                if (result[i].stories.length > 0) {
                  let a = [];

                    result[i].stories.forEach(story => {
                      a.push(story);
                    });

                  let key = a[0].full_slug.split('/')[1];
                  console.log(`[Storyblok.js] -> fetched collection: ${key}`.cyan);
                  z[key] = a;
                } else {
                  console.log(`[Storyblok.js] -> empty folder!`.yellow);
                }
              } // if multiple stories
            } // if typeof object
          } // for loop
          // debug(z);
          resolve(z);
        }).catch(error => {
          reject('Not able to fetch all data');
        });
    });
  }
}
