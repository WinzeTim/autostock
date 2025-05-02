// ChannelSetting.js
const mongoose = require('mongoose');

const channelSettingSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  roles: [String]
});

module.exports = mongoose.model('ChannelSetting', channelSettingSchema);
