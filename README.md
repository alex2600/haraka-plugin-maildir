# Haraka Plugin MailDir

Forked from https://github.com/madeingnecca/haraka-plugins

### maildir.js
Implements a rudimental maildir backend for your smtp server, readable by other mail servers, like Dovecot.
The third party server can be used to serve emails to clients using pop or imap. Requires <strong>mkdirp</strong>.

## Installation

In Haraka base dir.

    npm i https://github.com/alex2600/haraka-plugin-maildir.git

In `config/plugins` add a line at the bottom:

    maildir


