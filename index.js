require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField, Partials } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const mongoose = require('mongoose');
const ChannelSetting = require('./ChannelSetting');

const token = process.env.TOKEN;
const mongoUri = process.env.MONGODB;
const port = 10000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const app = express();
app.use(express.json());

const rest = new REST({ version: '10' }).setToken(token);

// ... previous requires and setup unchanged ...

async function registerCommands(clientId) {
  const commands = [
    // Existing /setchannel command for stock updates
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive stock notifications.').setRequired(true)
      ),
    // New /setpetchannel command for pet/egg notifications
    new SlashCommandBuilder()
      .setName('setpetchannel')
      .setDescription('Select a channel to receive egg/pet notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive pet egg drops.').setRequired(true)
      ),
    // Weather command
    new SlashCommandBuilder()
      .setName('setweatherchannel')
      .setDescription('Select a channel to receive weather notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive weather alerts.').setRequired(true)
      ),
    // Set roles command
    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Set roles to be pinged for stock updates by item.')
      // All role options unchanged...
      .addStringOption(option => option.setName('frost').setDescription('Role to ping for Frost.')),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member, guildId } = interaction;
  if (!guildId) return;

  if (commandName === 'setchannel') {
    // Save stock notification channel
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, channelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating channel:', err);
      await interaction.editReply('❌ Failed to update the notification channel.');
    }

  } else if (commandName === 'setweatherchannel') {
    // Save weather notification channel
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, weatherChannelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`🌤️ Weather notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating weather channel:', err);
      await interaction.editReply('❌ Failed to update the weather channel.');
    }

  } else if (commandName === 'setpetchannel') {
    // Save pet egg drop channel
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, petChannelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`🥚 Pet/Egg notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating pet channel:', err);
      await interaction.editReply('❌ Failed to update the pet notification channel.');
    }

  } else if (commandName === 'setroles') {
    // Save all role IDs for various items/weather
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const roleKeys = [
      'daffodil', 'watermelon', 'pumpkin', 'apple', 'bamboo', 'coconut',
      'cactus', 'dragonfruit', 'mango', 'grape', 'mushroom',
      'godlysprinkler', 'advancedsprinkler', 'mastersprinkler', 'lightningrod',
      'rain', 'thunderstorm', 'frost'
    ];

    const roles = {};
    roleKeys.forEach(key => {
      const role = interaction.options.getString(key);
      if (role) roles[key] = role;
    });

    await ChannelSetting.findOneAndUpdate(
      { guildId },
      { $set: { roles } },
      { upsert: true }
    );

    await interaction.reply({ content: `✅ Roles saved: ${JSON.stringify(roles)}`, ephemeral: true });

  } else if (commandName === 'help') {
    await interaction.reply({
      content: `📘 Commands:\n- /setchannel — Set stock notification channel (admin only)\n- /setweatherchannel — Set weather notification channel (admin only)\n- /setpetchannel — Set egg/pet drop channel (admin only)\n- /setroles — Set roles to ping by item (admin only)\n- /help — Show this help message`,
      ephemeral: true
    });
  }
});

// Webhook route to handle all incoming webhook posts
const removeStockSuffix = (text) => text.replace(/:.*$/, '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

const extractLinesFromEmbed = (embed) => {
  let rawLines = [];

  if (embed.description) {
    rawLines = rawLines.concat(embed.description.split('\n'));
  }

  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      if (field.value) rawLines = rawLines.concat(field.value.split('\n'));
    }
  }

  return rawLines.map(line => removeStockSuffix(line));
};

app.post('/send-stock', async (req, res) => {
  const data = req.body;
  const type = data.type || 'stock';

  if (!data.embeds || !Array.isArray(data.embeds) || data.embeds.length === 0) {
    return res.status(400).send('No valid embed found in the webhook data.');
  }

  const embed = data.embeds[0];
  const normalizedLines = extractLinesFromEmbed(embed);

  const settings = await ChannelSetting.find();

  for (const setting of settings) {
    let channelIdToUse = setting.channelId;
    if (type === 'weather' && setting.weatherChannelId) {
      channelIdToUse = setting.weatherChannelId;
    } else if (type === 'pet' && setting.petChannelId) {
      channelIdToUse = setting.petChannelId;
    }

    const channel = await client.channels.fetch(channelIdToUse).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;

    try {
      const pingRoles = [];

      if (setting.roles && typeof setting.roles === 'object') {
        for (const [key, roleId] of Object.entries(setting.roles)) {
          const formattedKey = removeStockSuffix(key);
          if (normalizedLines.some(line => line.includes(formattedKey))) {
            pingRoles.push(`<@&${roleId}>`);
            console.log(`✅ Matched keyword "${key}" → ping <@&${roleId}>`);
          }
        }
      }

      await channel.send({
        content: pingRoles.length > 0 ? pingRoles.join(' ') : null,
        embeds: [embed],
      });

    } catch (err) {
      console.error(`❌ Failed to send to channel ${channelIdToUse}:`, err);
    }
  }

  res.sendStatus(200);
});

function updateBotStatus() {
  let i = 0;

  const getTotalUsers = () => {
    return client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
  };

  const activities = [
    () => ({ type: 3, name: `/help` }),
    () => ({ type: 3, name: `${client.guilds.cache.size} servers` }),
    () => ({ type: 3, name: `${getTotalUsers()} users` }),
  ];

  setInterval(() => {
    const activity = activities[i % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
    i++;
  }, 10000);
}

client.guilds.cache.forEach(guild => {
  guild.members.fetch().catch(() => {});
});

mongoose.connect(mongoUri)
  .then(() => {
    console.log('🟢 Connected to MongoDB.');
    app.listen(port, () => console.log(`🚀 Express server running on http://localhost:${port}`));
    client.login(token);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
  });
