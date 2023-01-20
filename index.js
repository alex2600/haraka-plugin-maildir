const os = require("os")
const fs = require("fs")
const path = require("path")
const util = require("util")

/////////////////////////////////////////////////////////////////////////
// https://github.com/haraka/Haraka/blob/master/docs/Plugins.md
/////////////////////////////////////////////////////////////////////////

const copyFileP = util.promisify(fs.copyFile)
const unlinkFileP = util.promisify(fs.unlink)
const existsP = util.promisify(fs.exists)
const linkP = util.promisify(fs.link)

/////////////////////////////////////////////////////////////////////////

exports.hook_queue = function (next, connection, params) { // connection @see https://haraka.github.io/core/Connection
   const plugin = this

   // logging @see https://haraka.github.io/core/Logging/
   plugin.logdebug("hook queue running for plugin maildir")

   // transaction @see https://haraka.github.io/core/Transaction
   const trx = connection.transaction
   const messageStream = trx.message_stream

   // create maildir filename
   const filename = `${new Date().valueOf()}.${trx.uuid}.${connection.local.host}`

   // create temporary filePath
   const tmpDir = os.tmpdir()
   const tmpFile = path.join(tmpDir, filename)
   plugin.logdebug(`tmp file is ${tmpFile}`)

   // write to tmp file
   const ws = fs.createWriteStream(tmpFile)
   messageStream.pipe(ws)

   ws.on("error", (err) => handleError(err, plugin, next))
   ws.on("finish", function () {
      plugin.logdebug("ws.finish: mail written to tmpFile")

      return deliverFileToRcpts(filename, tmpFile, trx.rcpt_to, plugin)
         .then(() => plugin.logdebug("done delivering all mails to maildir"))
         .then(() => next(OK, "delivered mail to rcpt maildir"))
         .catch(err => handleError(err, plugin, next))
         .finally(function () {
            ws.close()
            return tryDeleteFile(tmpFile)
         })
   })
}

/////////////////////////////////////////////////////////////////////////

function handleError (err, plugin, next) {
   plugin.logerror(err.toString())
   // DENY if mail could not be delivered
   return next(DENY, err.toString())
}

function deliverFileToRcpts (filename, tmpFile, rcpts, plugin) {
   return Promise.all(rcpts.map(rcpt => deliverFileToRcpt(filename, tmpFile, rcpt, plugin)))
}

function deliverFileToRcpt (filename, tmpFile, rcpt, plugin) {
   const {user, host, original} = rcpt
   const {maildirBaseTemplate} = plugin.config.get('maildir.yaml')

   plugin.loginfo(`delivering ${filename} to ${original}`)
   const maildirBase = maildirBaseTemplate.replaceAll("%u", user).replaceAll("%d", host)
   const targetPath1 = `${maildirBase}/tmp`
   const targetPath2 = `${maildirBase}/new`
   const targetFile1 = `${targetPath1}/${filename}`
   const targetFile2 = `${targetPath2}/${filename}`

   return Promise
      .all([existsP(tmpFile), existsP(targetPath1), existsP(targetPath2)])
      .then(function ([tmpFileExists, targetPath1Exists, targetPath2Exists]) {
         // check for errors
         plugin.logdebug("checking if files and dirs exist before copying")
         let msg = null
         if (!tmpFileExists) {
            msg = `tmp file does not exist: "${tmpFile}"`
         }
         else if (!targetPath1Exists) {
            msg = `path does not exist: "${targetPath1}"`
         }
         else if (!targetPath2Exists) {
            msg = `path does not exist: "${targetPath2}"`
         }
         if (msg) throw new Error(msg)

         // copy mail to maildir "tmp"
         plugin.logdebug("copy file to 'tmp' dir")
         return copyFileP(tmpFile, targetFile1)
            .then(function () {
               // link to maildir "new"
               plugin.logdebug("linking file to 'new' dir")
               return linkP(targetFile1, targetFile2)
            })
            .then(function () {
               plugin.logdebug("delete file in 'tmp' dir")
               return tryDeleteFile(targetFile1)
            })
      })
}

async function tryDeleteFile (file) {
   if (await existsP(file)) {
      return unlinkFileP(file)
   }
}
