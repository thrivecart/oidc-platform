const bcrypt = require('bcrypt');
const uuid = require('uuid');

module.exports = (bookshelf) => {
  var self = {
    encryptPassword: function(password) {
      return new Promise((resolve, reject) => {
        bcrypt.genSalt(10, (err, salt) => {
          if (err) reject(err);
          bcrypt.hash(password, salt, (err, hash) => {
            if (err) reject(err);
            resolve(hash);
          });
        });
      });
    },

    comparePasswords: function(password, user) {
      var hash = user.get('password');
      return new Promise(function(resolve, reject) {
        bcrypt.compare(password, hash, function(err, res) {
          if (res) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    },

    create: function(email, password) {
      return this.encryptPassword(password)
        .then(hashedPass => bookshelf.model('user').forge({
          id : uuid.v4(),
          email,
          password : hashedPass
        }).save({}, {method: 'insert'}));
    },

    authenticate: function(email, password) {
      return bookshelf.model('user').forge().fetch({email})
        .then(user => {
          if (!user) throw new Error('No user found for this email');
          return self.comparePasswords(password, user)
            .then(isAuthenticated => {
              if (!isAuthenticated) throw new Error('Password does not match record');
              return user.serialize({strictOidc: true});
            });
        });
    },

    findById: function(id) {
      return bookshelf.model('user').forge().fetch({id})
        .then(user => user.serialize({strictOidc: true}));
    },

    findByEmail: function(email) {
      return bookshelf.model('user').forge().fetch({ email })
        .then(user => user ? user.serialize({strictOidc: true}) : null);
    },

    createPasswordResetToken: function(id) {
      const expires = new Date();
      expires.setHours(expires.getHours() + 1);

      return bookshelf.model('user_password_reset_token').forge({
        token: uuid.v4(),
        user_id: id,
        expires_at: expires,
      }).save({}, {method: 'insert'});
    },

  };

  return self;
};

module.exports['@singleton'] = true;
module.exports['@require'] = ['bookshelf', 'email/email-service'];
