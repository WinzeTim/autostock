const mongoose = require('mongoose');

const channelSettingSchema = new mongoose.Schema({
  guildId: String,
  channelId: String, // default stock channel
  weatherChannelId: String, // weather-specific channel
  roles: { type: Object, default: {} }
});

module.exports = mongoose.model('ChannelSetting', channelSettingSchema);
