const os = require("os")
const fs = require("fs")
const path = require("path")
const util = require("util")

/////////////////////////////////////////////////////////////////////////

const copyFileP = util.promisify(fs.copyFile)
const unlinkFileP = util.promisify(fs.unlink)
const fileExistsP = util.promisify(fs.exists)

/////////////////////////////////////////////////////////////////////////

exports.hook_queue = function (next, connection, params) {
   const plugin = this

   // logging @see https://haraka.github.io/core/Logging/
   plugin.logdebug("hook queue running for plugin maildir")

   // transaction @see https://haraka.github.io/core/Transaction
   const trx = connection.transaction
   const messageStream = trx.message_stream

   // create mailbox filename
   const filename = `${new Date().valueOf()}.${trx.uuid}.${connection.local.host}`

   // create temporary filePath
   const tmpDir = os.tmpdir()
   const tmpFile = path.join(tmpDir, filename)
   plugin.logdebug(`tmp file is ${tmpFile}`)

   // write to tmp file
   const ws = fs.createWriteStream(tmpFile)
   messageStream.pipe(ws)

   ws.on("error", (err) => plugin.logerror(err.toString()))
   ws.on("finish", function () {
      plugin.logdebug("ws.finish: mail written to tmpFile")

      // deliver file to rcpts
      return deliverFileToRcpts(filename, tmpFile, trx.rcpt_to, plugin)
         .then(() => plugin.logdebug("done delivering all mails to maildir"))
         .then(() => next(OK))
         .catch(function (err) {
            plugin.logerror(err.toString())
            // DENY if mail could not be delivered
            return next(DENY, err.toString())
         })
         .finally(function () {
            ws.close()
            return tryDeleteTmpFile(tmpFile)
         })
   })
}

/////////////////////////////////////////////////////////////////////////

function deliverFileToRcpts (filename, tmpFile, rcpts, plugin) {
   return Promise.all(rcpts.map(rcpt => deliverFileToRcpt(filename, tmpFile, rcpt, plugin)))
}

function deliverFileToRcpt (filename, tmpFile, rcpt, plugin) {
   const {user, host, original} = rcpt
   plugin.loginfo(`delivering ${filename} to ${original}`)
   const targetFile = `./data/${user}/Maildir/tmp/${filename}` // todo
   return fileExistsP(tmpFile)
      .then(function (doesExist) {
         if (!doesExist) {
            let msg = `tmp file does not exist: "${tmpFile}"`
            throw new Error(msg)
         }
         else {
            return copyFileP(tmpFile, targetFile)
         }
      })
}

async function tryDeleteTmpFile (tmpFile) {
   if (await fileExistsP(tmpFile)) {
      return unlinkFileP(tmpFile)
   }
}
