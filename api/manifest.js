var config = require('./config');
var formatError = require('./src/lib/format-error');

var ioc = require('electrolyte');
ioc.use(ioc.dir('src/lib'));
ioc.use(ioc.dir('src/application'));

module.exports = Promise.all([
  ioc.create('bookshelf'),
  ioc.create('user/user-service'),
  ioc.create('redis-oidc-adapter'),
])
.then(values => Promise.all([
  // register all the stuff
  ioc.create('client/client-routes'),
  ioc.create('user/user-routes'),
  ioc.create('example/example-routes'),
])
  .then(routeArrays => ({
    routeArrays,
    bookshelf: values[0],
    userService: values[1],
    redisOidcAdapter: values[2],
  }))
)
.then(lib => ({
  server : {
    connections: {
      routes: {
        validate: {
          options: { abortEarly: false },
          failAction: (request, reply, source, error) => {
            reply(formatError(error));
          }
        }
      }
    }
  },
  connections : [{
    port : 9000
  }],
  registrations : [
    {
      plugin : {
        register : 'hapi-auth-jwt2'
      }
    },
    {
      plugin : {
        register : 'vision',
      }
    },
    {
      plugin : {
        register : '../bootstrap',
        options : {
          routeArrays: lib.routeArrays
        }
      }
    },
    {
      plugin : {
        register : 'hapi-email-kue',
        options : config('/email')
      }
    },
    {
      plugin : {
        register : './plugins/openid-connect/openid-connect',
        options : {
          prefix : 'op',
          authenticateUser : lib.userService.authenticate,
          findUserById : lib.userService.findById,
          cookieKeys : config('/oidcCookieKeys'),
          adapter : lib.redisOidcAdapter,
          keystores : require('./keystores.json'),

          clientsPromise : lib.bookshelf.model('client').fetchAll({
            withRelated: ['grant_types', 'contacts', 'redirect_uris'],
          }).then(clients => clients.serialize({strictOidc: true})),
        }
      }
    }
  ]
}));
