var config = require('./config');
var formatError = require('./src/lib/format-error');
var fetchKeystores = require('./src/lib/fetch-keystores');

var ioc = require('electrolyte');
ioc.use(ioc.dir('src/lib'));
ioc.use(ioc.dir('src/application'));

module.exports = Promise.all([
  ioc.create('bookshelf'),
  ioc.create('user/user-service'),
  ioc.create('oidc-adapter/redis'),
  ioc.create('oidc-adapter/sql'),
  fetchKeystores(),
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
    sqlOidcAdapter: values[3],
    keystores: values[4],
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
          cookieKeys : config('/oidc/cookieKeys'),
          initialAccessToken : config('/oidc/initialAccessToken'),
          adapter : function OidcAdapterFactory(name) {
            return (name === 'Client') ? new lib.sqlOidcAdapter(name) : new lib.redisOidcAdapter(name);
          },
          keystores : lib.keystores,
        }
      }
    }
  ]
}));
