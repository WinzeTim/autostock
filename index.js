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

async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive stock notifications.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setweatherchannel')
      .setDescription('Select a channel to receive weather notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive weather alerts.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Set roles to be pinged for stock updates by item.')
      .addStringOption(option => option.setName('daffodil').setDescription('Role to ping for Daffodil Seeds.'))
      .addStringOption(option => option.setName('watermelon').setDescription('Role to ping for Watermelon Seeds.'))
      .addStringOption(option => option.setName('pumpkin').setDescription('Role to ping for Pumpkin Seeds.'))
      .addStringOption(option => option.setName('apple').setDescription('Role to ping for Apple Seeds.'))
      .addStringOption(option => option.setName('bamboo').setDescription('Role to ping for Bamboo Seeds.'))
      .addStringOption(option => option.setName('coconut').setDescription('Role to ping for Coconut Seeds.'))
      .addStringOption(option => option.setName('cactus').setDescription('Role to ping for Cactus Seeds.'))
      .addStringOption(option => option.setName('dragonfruit').setDescription('Role to ping for Dragon Fruit Seeds.'))
      .addStringOption(option => option.setName('mango').setDescription('Role to ping for Mango Seeds.'))
      .addStringOption(option => option.setName('grape').setDescription('Role to ping for Grape Seeds.'))
      .addStringOption(option => option.setName('mushroom').setDescription('Role to ping for Mushroom Seeds.'))
      .addStringOption(option => option.setName('godlysprinkler').setDescription('Role to ping for Godly Sprinkler.'))
      .addStringOption(option => option.setName('advancedsprinkler').setDescription('Role to ping for Advanced Sprinkler.'))
      .addStringOption(option => option.setName('mastersprinkler').setDescription('Role to ping for Master Sprinkler.'))
      .addStringOption(option => option.setName('lightningrod').setDescription('Role to ping for Lightning Rod.'))
      .addStringOption(option => option.setName('rain').setDescription('Role to ping for Rain.'))
      .addStringOption(option => option.setName('thunderstorm').setDescription('Role to ping for Thunderstorm.'))
      .addStringOption(option => option.setName('frost').setDescription('Role to ping for Frost.')),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

async function loadSettings() {
  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    const guild = await client.guilds.fetch(setting.guildId).catch(() => null);
    if (!guild) continue;
    await client.channels.fetch(setting.channelId).catch(() => null);
    if (setting.weatherChannelId) await client.channels.fetch(setting.weatherChannelId).catch(() => null);
  }
}

client.on('ready', async () => {
  console.log('🤖 Bot is ready!');
  await registerCommands(client.user.id);
  await loadSettings();
  updateBotStatus();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member, guildId } = interaction;
  if (!guildId) return;

  if (commandName === 'setchannel') {
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

  } else if (commandName === 'setroles') {
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
      content: `📘 Commands:\n- /setchannel — Set stock notification channel (admin only)\n- /setweatherchannel — Set weather notification channel (admin only)\n- /setroles — Set roles to ping by item (admin only)\n- /help — Show this help message`,
      ephemeral: true
    });
  }
});

app.post('/send-stock', async (req, res) => {
  const data = req.body;
  const type = data.type || 'stock';

  if (!data.embeds || !Array.isArray(data.embeds) || data.embeds.length === 0) {
    return res.status(400).send('No valid embed found in the webhook data.');
  }

  const embed = data.embeds[0];
  const embedText = JSON.stringify(embed).toLowerCase();

  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    let channelIdToUse = setting.channelId;
    if (type === 'weather' && setting.weatherChannelId) {
      channelIdToUse = setting.weatherChannelId;
    }

    const channel = await client.channels.fetch(channelIdToUse).catch(() => null);
    
    if (channel && channel.isTextBased()) {
      try {
        const pingRoles = [];

        if (setting.roles && typeof setting.roles === 'object') {
          for (const [key, roleId] of Object.entries(setting.roles)) {
            if (roleId && embed?.description?.toLowerCase().includes(key.toLowerCase())) {
              pingRoles.push(`<@&${roleId}>`);
            }
          }
        }

        await channel.send({
          content: pingRoles.join(' ') || null,
          embeds: [embed],
        });

      } catch (err) {
        console.error(`Failed to send to channel ${channelIdToUse}:`, err);
      }
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
