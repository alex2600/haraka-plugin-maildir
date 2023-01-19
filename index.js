const os = require('os')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const util = require('util')

/////////////////////////////////////////////////////////////////////////

module.exports = {
   hook_queue,
}

/**
 * Saves email when the smtp server enqueues it.
 */
function hook_queue (next, connection) {
   const accept = function () {
      next(OK)
   }

   const plugin = this
   const t = connection.transaction
   const cfg = this.config.get('maildir.ini', 'ini')

   const mail_from = extractEmail(t.mail_from.original)
   const rcpt_to = t.rcpt_to.map(function (to) {
      return to.user + '@' + to.host
   })

   const maildir = new Maildir(cfg.main, this, connection)
   const stream = t.message_stream

   // Give the possibility to force the maildir user.
   // const forced = trim(t.header.get('x-maildir-force-user')) || cfg.main.force_user
   const forced = cfg.main.force_user // don't allow header overwrite
   if (forced) {
      maildir.maildir({user: forced}).messageStream(stream, accept)
      return
   }

   // Collect mailboxes.
   const mailboxes = []

   // Sender could be empty ("<>" value) in some bounce messages.
   // Thanks Koshroy.
   if (mail_from) {
      // Populate ".Sent" dir of sender.
      mailboxes.push({
         user: mail_from,
         folder: '.Sent',
      })
   }
   else {
      this.logdebug('Mail from is empty, probably this is a bounce message.')
   }

   rcpt_to.forEach(function (user) {
      mailboxes.push({user})
   });

   // Process mailboxes.
   (function nextMailbox (i, cb) {
      if (i === mailboxes.length) {
         cb()
      }
      else {
         maildir.maildir(mailboxes[i]).messageStream(stream, function () {
            nextMailbox(i + 1, cb)
         })
      }
   }(0, accept))
}

/////////////////////////////////////////////////////////////////////////

/**
 * Object for managing maildirs.
 * @param {hash} cfg
 */
class Maildir {
   constructor (cfg, plugin, conn) {
      this.cfg = cfg
      this.plugin = plugin
      this.connection = conn
   }

   /**
    * Unique name of the file inside the maildir.
    * Thanks: http://cr.yp.to/proto/maildir.html
    *
    * @return {string}
    */
   filename () {
      // For filename uniqueness, connection uuid is used.
      const uuid = this.connection.uuid
      const d = new Date()
      const name = d.valueOf() + '.' + uuid + '.' + os.hostname()
      return name
   }

   maildir (params) {
      const self = this
      const user = params.user
      const folder = params.folder
      const userParts = user.split('@')
      const name = userParts[0], domain = userParts[1]
      let dirMode, fileMode

      return {
         ready: function (callback) {
            const fileName = self.fileName()
            const dirs = ['tmp', 'cur', 'new']
            let maildir = self.cfg.path
            dirMode = parseInt(self.cfg.dir_mode, 8)
            fileMode = parseInt(self.cfg.file_mode, 8)

            const replace = {d: domain, n: name}
            for (let v in replace) {
               maildir = maildir.replace('%' + v, replace[v])
            }

            // Checks if maildir location is relative to haraka.
            if (path.sep !== maildir.charAt(0)) {
               maildir = path.join(process.env.HARAKA, maildir) // TODO check if env.HARAKA is set
            }

            const f = {}
            dirs.forEach(function (dir) {
               const parts = [maildir]
               if (folder) {
                  parts.push(folder)
               }
               parts.push(dir)
               parts.push(fileName)
               f[dir] = path.join.apply(path, parts)
            });

            (function nextDir (i, cb) {
               if (i === dirs.length) {
                  return cb()
               }

               var dir = path.dirname(f[dirs[i]])
               fs.exists(dir, function (exists) {
                  if (exists) {
                     nextDir(i + 1, cb)
                  }
                  else {
                     mkdirp(dir, dirMode, function (err) {
                        if (err) {
                           throw err
                        }
                        nextDir(i + 1, cb)
                     })
                  }
               })
            }(0, function () {
               self.plugin.logdebug('Maildir ready: ' + util.format('%j, %s', f, fileName))
               callback(f, fileName)
            }))
         },
         messageStream: function (stream, callback) {
            this.ready(function (f, name) {
               var fileStream = fs.createWriteStream(f['tmp'], {
                  flags: 'w',
                  mode: fileMode
               })
               stream.pipe(fileStream)
               fileStream.on('finish', function () {
                  fs.link(f['tmp'], f['new'], function (err) {
                     if (err) {
                        throw err
                     }
                     fs.unlink(f['tmp'], function (err) {
                        if (err) {
                           throw err
                        }
                        callback()
                     })
                  })
               })
            })
         }
      }
   }
}

/////////////////////////////////////////////////////////////////////////

/**
 * Extracts the email from a recipient address (USER <EMAIL>).
 * See "Address Specification" in http://tools.ietf.org/html/rfc2822.
 *
 * @param  {string} rcpt the recipient
 * @return {string}      the extracted email.
 */
function extractEmail (rcpt) {
   var emailRegexp = /([^<@\s,]+@[^@>,\s]+)/
   var match

   if ((match = rcpt.match(emailRegexp)) && match.length) {
      return match[1]
   }

   return null
}


/**
 * Removes both leading and trailing whitespaces
 * from a string.
 *
 * @param  {string} string
 * @return {string}
 */
function trim (string) {
   return string.replace(/^\s+|\s+$/g, '')
}
