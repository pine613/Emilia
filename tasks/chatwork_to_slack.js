'use strict'

const querystring = require('querystring')

const chatworkMessages = require('chatwork-messages')({ force: true })
const log = require('fancy-log')
const _ = require('lodash')

const MongoDb = require('../lib/mongodb')
const Slack = require('../lib/slack')

// ----------------------------------------------------------------------------

const mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/emilia'
const chatworkToken = process.env.CHATWORK_API_TOKEN
const slackToken = process.env.SLACK_API_TOKEN
const roomCount = +process.env.CHATWORK_ROOM_COUNT

if (_.isEmpty(chatworkToken)) {
  log.error('`CHATWORK_API_TOKEN` is required.')
  process.exit(1)
}

if (_.isEmpty(slackToken)) {
  log.error('`SLACK_API_TOKEN` is required.')
  process.exit(1)
}

if (_.isNaN(roomCount)) {
  log('`CHATWORK_ROOM_COUNT` is required.')
  process.exit(1)
}

// ----------------------------------------------------------------------------

const rooms = []
for (let i = 0; i < roomCount; ++i) {
  const envName = `CHATWORK_ROOM_${i}`
  const envValue = process.env[envName]
  const room = querystring.parse(envValue, ';')

  if (_.isEmpty(room)) {
    log(`\`${envName}\` is required.`)
    process.exit(1)
  }

  ;[ 'rid', 'channel' ].forEach(key => {
    if (_.size(room[key]) === 0) {
      log(`\`${envName}\` (${envValue}) does\'t have \`${key}\` property.`)
      process.exit(1)
    }
  })

  rooms.push(room)
}

// ----------------------------------------------------------------------------

module.exports = async () => {
  const mongo = new MongoDb({ url: mongoUrl })
  const slack = new Slack({ token: slackToken })
  await mongo.connect()

  for (const room of rooms) {
    const messages = await chatworkMessages({ roomId: room.rid, token: chatworkToken })
    const newMessages = await mongo.filterIfNotExist(messages)

    if (_.size(newMessages) === 0) return
    log(`Find ${_.size(newMessages)} messages on rid:${room.rid}`)

    await slack.notifyMessages({ channel: room.channel, messages: newMessages })
    await mongo.save(newMessages)
  }

  await mongo.disconnect()
}
