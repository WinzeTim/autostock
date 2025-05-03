const mongoose = require('mongoose');

const channelSettingSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,         // default stock channel
  weatherChannelId: String,  // weather-specific channel
  petChannelId: String,      // pet/egg-specific channel
  roles: { type: Object, default: {} } // roles to ping by keyword
});

module.exports = mongoose.model('ChannelSetting', channelSettingSchema);
