# Haraka Plugin MailDir

## About

Implements a rudimental maildir backend for your smtp server, readable by other mail servers, like Dovecot.
The third party server can be used to serve emails to clients using pop or imap. 

## Installation

In Haraka base dir:

    npm i https://github.com/alex2600/haraka-plugin-maildir.git

In file `config/plugins` add a line at the bottom to enable the plugin:

    maildir

Copy the default config file to `config/.`:

    cp ./node_modules/haraka-plugin-maildir/config/maildir.yaml config/.

Adapt the config file `maildir.yaml` to your needs.

Restart Haraka and you are ready to go. 
